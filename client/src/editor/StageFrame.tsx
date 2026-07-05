import { useEffect, useMemo, useRef } from 'react';
import type { Slide } from '../model/deck';
import type { DeckMeta } from '../state/deckStore';
import { useDeckStore } from '../state/deckStore';
import { useEditorStore } from './editorStore';
import { slideElement } from '../model/deck';
import { stageHead, stageLayoutCss } from './stageDoc';
import { TextSession } from './TextSession';
import { handlerFor, textEditableFrom } from './registry';
import { hydrateCodeBlocks } from './codeHighlight';
import {
  type Edges,
  applyStyle,
  isAbsolute,
  isLayoutContainer,
  marqueeHits,
  placeInFlow,
  snapEdges,
  snapRect,
  stageRect,
  stageWriter,
  toAbsoluteAll,
  unrotatedRect,
  writeStageRect,
} from './geometry';
import { showAllFragments } from './fragments';
import {
  REF_ATTR,
  detachForMove,
  ensureShapeLabel,
  insertShape,
  isConnectorEl,
  isLineKind,
  reconcileConnectors,
} from './shapes';
import {
  gridCoordOf,
  insertTableFromData,
  nextCell,
  parseClipboardTable,
  parseTsv,
  pasteFillCells,
} from './table';
import { type StageCtx, commit } from './commands';
import { dispatchShortcut } from './actions/dispatcher';

const DRAG_THRESHOLD = 4; // slide px before a press becomes a drag
const SNAP_THRESHOLD = 6; // slide px

/**
 * The editing surface: a same-origin iframe at slide design size (scaled by
 * the parent), loading reveal.css + theme but never the reveal runtime.
 * Owns hit-testing, selection, drag-to-move, text/code session activation,
 * and keyboard handling while focus is inside the iframe.
 *
 * Press semantics: press-and-drag moves the element (converting flow →
 * absolute on first move); a clean click activates (select → edit).
 */
export function StageFrame({ slide, meta }: { slide: Slide | null; meta: DeckMeta }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const sessionRef = useRef<TextSession | null>(null);
  /** Source text we last injected or committed — used to skip echo rebuilds. */
  const cleanSource = useRef<string | null>(null);
  const ctxRef = useRef<StageCtx | null>(null);
  const slideRef = useRef(slide);
  slideRef.current = slide;

  const { width, height, center } = meta.config;

  const srcDoc = useMemo(() => {
    return `<!doctype html>
<html>
<head>
${stageHead(meta)}
<style>${stageLayoutCss(meta)}
  [contenteditable]:focus { outline: none; }
  body[data-re-draw], body[data-re-draw] * { cursor: crosshair !important; }
  .reveal .slides section :where(h1,h2,h3,h4,h5,h6,p,ul,ol,blockquote,img,pre,div,figure,table) {
    cursor: default;
  }
</style>
</head>
<body class="reveal-viewport">
<div class="reveal"><div class="slides"><section class="present" id="re-stage"></section></div></div>
</body>
</html>`;
    // managedCss deliberately absent: it changes DURING gestures (pinning a
    // section adds the free-layout rule) and a srcDoc rebuild would reload
    // the iframe mid-drag — the effect below patches the style in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.path, meta.theme, meta.themeHref, meta.stylesheets, meta.headStyles, width, height, center]);

  const managedCss = meta.managedCss;
  useEffect(() => {
    const doc = iframeRef.current?.contentDocument;
    const el = doc?.querySelector('style[data-re-managed]');
    if (el && el.textContent !== managedCss) el.textContent = managedCss;
  }, [managedCss]);

  // Draw mode (armed shape): crosshair over the whole stage.
  const pendingShapeKind = useEditorStore((s) => s.pendingShapeKind);
  useEffect(() => {
    const body = iframeRef.current?.contentDocument?.body;
    if (!body) return;
    if (pendingShapeKind) body.setAttribute('data-re-draw', '');
    else body.removeAttribute('data-re-draw');
  }, [pendingShapeKind]);

  function endSession(commitFirst: boolean) {
    const session = sessionRef.current;
    if (!session) return;
    sessionRef.current = null;
    if (commitFirst) session.exit();
    else session.dispose();
  }

  function startSession(el: HTMLElement, caretPoint?: { x: number; y: number }) {
    const ctx = ctxRef.current;
    if (!ctx) return;
    endSession(true);
    const editor = useEditorStore.getState();
    editor.select(el);
    const isCell = el.tagName === 'TD' || el.tagName === 'TH';
    sessionRef.current = new TextSession(el, {
      onCommit: () => commit(ctx),
      onExit: () => {
        if (useEditorStore.getState().sessionEl === el) {
          useEditorStore.getState().setSessionEl(null);
        }
      },
      // Focus landing on editor chrome (text toolbar, font/color dropdowns,
      // link popover) must not end the session — the parent document knows
      // where focus went.
      ignoreBlur: () => {
        const active = document.activeElement as HTMLElement | null;
        return !!active?.closest?.(
          '.toolbar, .mantine-Popover-dropdown, [data-combobox-dropdown], .mantine-Menu-dropdown',
        );
      },
      // Excel/Sheets multi-cell paste distributes into the grid instead of
      // dumping tab-separated text into one cell.
      onPasteText: isCell
        ? (text) => pasteFillCells(ctx, el as HTMLTableCellElement, text)
        : undefined,
      onTab: isCell
        ? (shift) => {
            const next = nextCell(el as HTMLTableCellElement, shift ? -1 : 1);
            if (!next) return false;
            startSession(next);
            return true;
          }
        : undefined,
    });
    editor.setSessionEl(el);
    if (caretPoint) placeCaretAt(ctx.doc, caretPoint.x, caretPoint.y);
  }

  /** Activate the editor appropriate to an element (text session / code modal). */
  function activate(el: HTMLElement, caretPoint?: { x: number; y: number }, target?: Element) {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const handler = handlerFor(el);
    if (handler.type === 'code') {
      useEditorStore.getState().setCodeEditEl(el);
      return;
    }
    if (handler.type === 'chart') {
      useEditorStore.getState().setChartEditEl(el);
      return;
    }
    if (handler.capabilities.textEdit) {
      const editable = textEditableFrom(target ?? el, ctx.section) ?? el;
      startSession(editable, caretPoint);
      return;
    }
    // Self-describing shapes: the svg children are baked render output, not
    // content to drill into. Activating a fill shape edits its LABEL —
    // created on first activation (PowerPoint's "click a shape and type").
    // Connectors label on DOUBLE-click only (see the dblclick handler): a
    // plain click must not hijack endpoint editing.
    if (handler.type === 'shape') {
      if (isConnectorEl(el)) return;
      const label = ensureShapeLabel(el);
      if (label) startSession(label, caretPoint);
      return;
    }
    // Non-text containers: drill one level toward the click target.
    if (target && el !== target && el.contains(target) && el.children.length > 0) {
      const deeper = childOf(el, target);
      if (deeper) useEditorStore.getState().select(deeper);
    }
  }

  /** Ancestor of `target` that is a direct child of `parent`. */
  function childOf(parent: Element, target: Element): HTMLElement | null {
    let el: Element | null = target;
    while (el && el.parentElement !== parent) el = el.parentElement;
    return (el as HTMLElement) ?? null;
  }

  /**
   * The component nearest a point: the ancestor of `target` whose parent is
   * a layout container (column, cell) or the slide itself. Content inside a
   * group or table resolves to the group/table — those act as one unit.
   */
  function componentOf(section: HTMLElement, target: Element): HTMLElement | null {
    let el: Element | null = target;
    while (el && el !== section) {
      const parent: Element | null = el.parentElement;
      if (!parent) return null;
      if (parent === section || isLayoutContainer(parent, section)) break;
      el = parent;
    }
    return el === section ? null : (el as HTMLElement);
  }

  function wireInteractions(doc: Document, section: HTMLElement) {
    let press: {
      el: HTMLElement;
      wasSelected: boolean;
      target: Element;
      pointerId: number;
      x: number;
      y: number;
      dragging: boolean;
      startLeft: number;
      startTop: number;
      /** Other selected members dragged along (multi-select). */
      others: {
        el: HTMLElement;
        startLeft: number;
        startTop: number;
        write?: (pos: { left: number; top: number }) => void;
      }[];
      /** Cached at drag start — nothing here can change mid-gesture, and
       *  re-measuring per move causes forced reflows (laggy table drags). */
      size?: { w: number; h: number };
      edges?: Edges;
      write?: (pos: { left: number; top: number }) => void;
    } | null = null;

    /** Marquee rubber-band selection, started from empty canvas. */
    let marquee: { x0: number; y0: number; active: boolean } | null = null;

    /** Drag across table cells to select a rectangular range. */
    let cellDrag: {
      table: HTMLTableElement;
      anchor: [number, number];
      pointerId: number;
      x0: number;
      y0: number;
    } | null = null;

    /** Armed shape being drawn (draw mode): click places, drag sizes. */
    let draw: { x0: number; y0: number; kind: import('./shapes').ShapeKind; active: boolean } | null =
      null;

    /** Prospective drop position during a layout-mode drag. */
    let drop: { parent: HTMLElement; before: HTMLElement | null } | null = null;

    /** Resolve the container + insertion point under the pointer. */
    function resolveDrop(x: number, y: number, dragged: HTMLElement) {
      const ctx = ctxRef.current!;
      let hit = doc.elementFromPoint(x, y);
      while (hit && (hit === dragged || dragged.contains(hit))) hit = hit.parentElement;
      let container: HTMLElement | null = null;
      let cursor: Element | null = hit;
      while (cursor) {
        if (isLayoutContainer(cursor, section)) {
          container = cursor as HTMLElement;
          break;
        }
        if (cursor === section) break;
        cursor = cursor.parentElement;
      }
      if (!container) container = section;

      const kids = Array.from(container.children).filter(
        (c): c is HTMLElement =>
          c !== dragged &&
          (c as HTMLElement).style !== undefined &&
          !(c.tagName === 'ASIDE' && c.classList.contains('notes')) &&
          (c as HTMLElement).style.position !== 'absolute',
      );
      const cs = ctx.doc.defaultView!.getComputedStyle(container);
      const horizontal = cs.display.includes('flex') && cs.flexDirection.startsWith('row');
      let before: HTMLElement | null = null;
      // stageRect: x/y are pointer coords, which ARE stage coords.
      for (const kid of kids) {
        const r = stageRect(ctx, kid);
        const mid = horizontal ? r.left + r.width / 2 : r.top + r.height / 2;
        if ((horizontal ? x : y) < mid) {
          before = kid;
          break;
        }
      }
      // Insertion indicator line in slide coords.
      const cRect = stageRect(ctx, container);
      let indicator: { x: number; y: number; w: number; h: number };
      if (kids.length === 0) {
        indicator = horizontal
          ? { x: cRect.left + 4, y: cRect.top + 2, w: 2, h: Math.max(24, cRect.height - 4) }
          : { x: cRect.left + 2, y: cRect.top + 4, w: Math.max(24, cRect.width - 4), h: 2 };
      } else {
        const anchor = before ?? kids[kids.length - 1];
        const r = stageRect(ctx, anchor);
        const pos = before
          ? horizontal ? r.left - 2 : r.top - 2
          : horizontal ? r.left + r.width + 2 : r.top + r.height + 2;
        indicator = horizontal
          ? { x: pos, y: r.top, w: 2, h: r.height }
          : { x: r.left, y: pos, w: r.width, h: 2 };
      }
      drop = { parent: container, before };
      useEditorStore.getState().setDropIndicator(indicator);
    }

    function applyMarquee(x1: number, y1: number) {
      if (!marquee) return;
      const rect = {
        x: Math.min(marquee.x0, x1),
        y: Math.min(marquee.y0, y1),
        w: Math.abs(x1 - marquee.x0),
        h: Math.abs(y1 - marquee.y0),
      };
      useEditorStore.getState().setMarquee(rect);
      useEditorStore.getState().selectMany(marqueeHits(ctxRef.current!, rect));
    }

    /** A drag that loses its pointer must still land: commit and clear. */
    function finalizePress() {
      const p = press;
      press = null;
      cellDrag = null;
      if (marquee) {
        marquee = null;
        useEditorStore.getState().setMarquee(null);
      }
      drop = null;
      useEditorStore.getState().setDropIndicator(null);
      useEditorStore.getState().setSnapGuides(null);
      useEditorStore.getState().setDragRect(null);
      if (p?.dragging) applyStyle(p.el, { 'pointer-events': null });
      if (p?.dragging && ctxRef.current && !useEditorStore.getState().layoutMode) {
        commit(ctxRef.current);
      }
    }

    doc.addEventListener('contextmenu', (e) => {
      const target = e.target as Element;
      const session = sessionRef.current;
      // Native menu (spellcheck etc.) stays available inside active editing.
      if (session && session.el.contains(target)) return;
      e.preventDefault();
      const editor = useEditorStore.getState();
      if (session) endSession(true);
      if (section.contains(target) && target !== section) {
        // Right-click targets the COMPONENT under the cursor — the ancestor
        // whose parent is a layout container (column, cell) or the slide —
        // so nested elements get their own menu (move/duplicate/delete).
        const component = componentOf(section, target);
        const selected = editor.selectedEl;
        // A selection at or below the resolved component survives (a nested
        // element picked in the Layers panel must not be re-targeted).
        const keep =
          !!selected &&
          selected.isConnected &&
          !!component &&
          (component === selected || component.contains(selected));
        if (!keep) {
          const cell = target.closest('td, th');
          // Table cells take priority over coarse targets (the whole table):
          // row/column ops need a cell context (PowerPoint behavior). A finer
          // component INSIDE the cell still wins — ctx.cell derives from it.
          if (cell && section.contains(cell) && (!component || component.contains(cell))) {
            editor.select(cell as HTMLElement);
          } else if (component) {
            editor.select(component);
          }
        }
      } else {
        editor.select(null);
      }
      editor.setContextMenu({ x: e.clientX, y: e.clientY });
    });

    doc.addEventListener('pointerdown', (e) => {
      const target = e.target as Element;
      const session = sessionRef.current;
      const inSession = !!session && session.el.contains(target);
      // Mantine popovers/menus in the parent close on outside mousedown, but
      // clicks inside this iframe never reach the parent document — forward
      // one so open pickers/dropdowns close like they would anywhere else.
      // Flagged: the App-level session-ending handler must ignore it, or a
      // click INSIDE the active session would end that session — and the
      // ensuing drag-to-select-text would DRAG the element (a table cell
      // ripped to position:absolute "disappears").
      const fwd = new MouseEvent('mousedown', { bubbles: true }) as MouseEvent & {
        reFromStage?: boolean;
      };
      fwd.reFromStage = true;
      document.dispatchEvent(fwd);
      // Keep focus in the editable when the click stays inside the session.
      if (!inSession) (document.activeElement as HTMLElement | null)?.blur?.();
      if (e.button !== 0) return;
      if (useEditorStore.getState().contextMenu) useEditorStore.getState().setContextMenu(null);
      // Draw mode: an armed shape kind captures the gesture — click places
      // the default size here, a drag draws at the dragged rect/line.
      const pendingKind = useEditorStore.getState().pendingShapeKind;
      if (pendingKind) {
        draw = { x0: e.clientX, y0: e.clientY, kind: pendingKind, active: false };
        try {
          (target as HTMLElement).setPointerCapture?.(e.pointerId);
        } catch {
          /* best-effort */
        }
        return;
      }
      if (press) finalizePress(); // stale gesture (missed pointerup)
      const editor = useEditorStore.getState();
      if (session) {
        if (inSession) return; // native text editing
        endSession(true);
      }
      if (!section.contains(target) || target === section) {
        // Empty canvas: potential marquee; selection clears on clean click.
        marquee = { x0: e.clientX, y0: e.clientY, active: false };
        try {
          (target as HTMLElement).setPointerCapture?.(e.pointerId);
        } catch {
          /* best-effort */
        }
        return;
      }
      const selected = editor.selectedEl;
      const withinSelected =
        !!selected && selected.isConnected && (selected === target || selected.contains(target));
      const el = withinSelected ? selected! : childOf(section, target);
      if (!el) return;

      // Shift-click inside a table extends the rectangular cell selection from
      // the current cell (anchor) to the clicked cell (focus).
      if (e.shiftKey) {
        const focusCell = (target as Element).closest('td, th') as HTMLTableCellElement | null;
        const anchorCell = editor.selectedEl?.closest('td, th') as HTMLTableCellElement | null;
        const table = focusCell?.closest('table') as HTMLTableElement | null;
        if (focusCell && anchorCell && table && anchorCell.closest('table') === table) {
          const a = gridCoordOf(table, anchorCell);
          const b = gridCoordOf(table, focusCell);
          if (a && b) {
            editor.setCellSel({ r0: a[0], c0: a[1], r1: b[0], c1: b[1] });
            return;
          }
        }
      }

      // Shift/Ctrl/Cmd-click toggles set membership — no drag, no activation.
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        editor.toggleSelect(withinSelected ? selected! : el);
        return;
      }
      if (!withinSelected) {
        // Clicking a member of a multi-selection keeps the set (drag all).
        const inSet = editor.extraSelected.includes(el);
        if (!inSet) editor.select(el);
        else editor.toggleSelect(el), editor.toggleSelect(el); // promote to primary
      }

      // Arm a cell drag-select: a drag crossing into another cell selects the
      // rectangle instead of moving the table (a same-cell drag still moves).
      const downCell = (target as Element).closest('td, th') as HTMLTableCellElement | null;
      const downTable = downCell?.closest('table') as HTMLTableElement | null;
      if (downCell && downTable && section.contains(downTable)) {
        const a = gridCoordOf(downTable, downCell);
        if (a) {
          cellDrag = { table: downTable, anchor: a, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY };
          try {
            (target as HTMLElement).setPointerCapture?.(e.pointerId);
          } catch {
            /* best-effort */
          }
        }
      }

      const ctx = ctxRef.current!;
      // Inline left/top position the UNROTATED box — a rotated element's
      // AABB would make the first write jump it by the rotation overhang.
      const rect = unrotatedRect(ctx, el);
      const others = [...useEditorStore.getState().extraSelected, useEditorStore.getState().selectedEl]
        .filter((o): o is HTMLElement => !!o && o.isConnected && o !== el)
        .map((o) => {
          const r = unrotatedRect(ctx, o);
          return { el: o, startLeft: r.left, startTop: r.top };
        });
      press = {
        el,
        wasSelected: withinSelected,
        target,
        pointerId: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        dragging: false,
        startLeft: rect.left,
        startTop: rect.top,
        others,
      };
    });

    doc.addEventListener('pointermove', (e) => {
      const ctx = ctxRef.current;
      if (draw && ctx) {
        if (!draw.active && Math.hypot(e.clientX - draw.x0, e.clientY - draw.y0) >= DRAG_THRESHOLD) {
          draw.active = true;
        }
        if (draw.active) {
          // Lines/arrows preview as the actual line being dragged; filled
          // shapes preview as their bounding rectangle (the marquee box).
          if (isLineKind(draw.kind)) {
            useEditorStore.getState().setDrawLine({
              kind: draw.kind,
              x1: draw.x0,
              y1: draw.y0,
              x2: e.clientX,
              y2: e.clientY,
            });
          } else {
            useEditorStore.getState().setMarquee({
              x: Math.min(draw.x0, e.clientX),
              y: Math.min(draw.y0, e.clientY),
              w: Math.abs(e.clientX - draw.x0),
              h: Math.abs(e.clientY - draw.y0),
            });
          }
        }
        return;
      }
      if (marquee && ctx) {
        if (!marquee.active && Math.hypot(e.clientX - marquee.x0, e.clientY - marquee.y0) >= DRAG_THRESHOLD) {
          marquee.active = true;
        }
        if (marquee.active) applyMarquee(e.clientX, e.clientY);
        return;
      }
      // Cell drag-select owns the gesture once past the drag threshold: it
      // selects the rectangle from the anchor cell to the cell under the
      // pointer and never moves the table. A tiny jitter stays a plain click.
      if (cellDrag && ctx) {
        if (Math.hypot(e.clientX - cellDrag.x0, e.clientY - cellDrag.y0) < DRAG_THRESHOLD) return;
        press = null;
        const over = (doc.elementFromPoint(e.clientX, e.clientY) as Element | null)?.closest(
          'td, th',
        ) as HTMLTableCellElement | null;
        if (over && over.closest('table') === cellDrag.table) {
          const b = gridCoordOf(cellDrag.table, over);
          if (b) {
            useEditorStore.getState().setCellSel({
              r0: cellDrag.anchor[0],
              c0: cellDrag.anchor[1],
              r1: b[0],
              c1: b[1],
            });
          }
        }
        return;
      }
      // Drag tracking (iframe coordinates ARE slide-space px — no scale math).
      if (press && ctx) {
        const dx = e.clientX - press.x;
        const dy = e.clientY - press.y;
        const layoutMode = useEditorStore.getState().layoutMode;
        if (!press.dragging && Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
          press.dragging = true;
          // Pointer capture keeps the gesture alive even when the pointer
          // leaves the iframe — without it, pointerup outside is lost and
          // the element "sticks to the mouse" with the move never committed.
          try {
            (press.target as HTMLElement).setPointerCapture?.(press.pointerId);
          } catch {
            /* capture is best-effort */
          }
          if (layoutMode) {
            // Let elementFromPoint see through the dragged element — walking
            // up from it would resolve its OWN parent as the drop target.
            press.el.style.pointerEvents = 'none';
          }
          if (!layoutMode) {
            // Manually moving a connector releases its attachments — unless
            // the attachment target moves along in the same gesture (dragging
            // a selection of box + arrows keeps the diagram wired).
            const moving = new Set<Element>([press.el, ...press.others.map((o) => o.el)]);
            for (const m of moving) {
              if (isConnectorEl(m)) detachForMove(ctx, m as HTMLElement, moving);
            }
            // One batch: all rects measured before the first conversion —
            // each conversion reflows the remaining flow content.
            toAbsoluteAll(ctx, [press.el, ...press.others.map((o) => o.el)], height);
            // Alt-drag duplicates: clones stay behind at the original spot,
            // the drag moves the originals (identity + attachments travel
            // with the moved element; clones mint fresh ids on next attach).
            if (e.altKey) {
              for (const m of [press.el, ...press.others.map((o) => o.el)]) {
                const dup = m.cloneNode(true) as HTMLElement;
                dup.removeAttribute(REF_ATTR);
                m.after(dup);
              }
            }
            const r = unrotatedRect(ctx, press.el);
            press.startLeft = r.left;
            press.startTop = r.top;
            press.size = { w: r.width, h: r.height };
            press.write = stageWriter(ctx, press.el);
            press.edges = snapEdges(ctx, press.el, width, height);
            press.others = press.others.map((o) => {
              const or = unrotatedRect(ctx, o.el);
              return {
                ...o,
                startLeft: or.left,
                startTop: or.top,
                write: stageWriter(ctx, o.el),
              };
            });
          }
        }
        if (press.dragging && layoutMode) {
          // Layout mode: the drag targets a flow position, not coordinates.
          e.preventDefault();
          resolveDrop(e.clientX, e.clientY, press.el);
          return;
        }
        if (press.dragging) {
          e.preventDefault();
          // Pure math against drag-start caches — zero layout reads per move.
          const raw = {
            left: press.startLeft + dx,
            top: press.startTop + dy,
            width: press.size!.w,
            height: press.size!.h,
          };
          const snap = snapRect(raw, press.edges!, SNAP_THRESHOLD);
          press.write!({ left: raw.left + snap.dx, top: raw.top + snap.dy });
          // Multi-select: the rest of the set rides along with the same delta.
          for (const o of press.others) {
            o.write?.({
              left: o.startLeft + dx + snap.dx,
              top: o.startTop + dy + snap.dy,
            });
          }
          // Arrows attached to anything just moved follow live. (No-op when
          // the slide has no attachments — guarded by a selector probe.)
          reconcileConnectors(ctx);
          // The overlay draws the selection box from these exact values —
          // measuring the iframe mid-drag returns the previous layout.
          useEditorStore.getState().setDragRect({
            left: raw.left + snap.dx,
            top: raw.top + snap.dy,
            width: raw.width,
            height: raw.height,
          });
          useEditorStore.getState().setSnapGuides({ x: snap.x, y: snap.y });
          return;
        }
      }
      // Hover affordance.
      if (sessionRef.current) return;
      const target = e.target as Element;
      const editor = useEditorStore.getState();
      if (!section.contains(target) || target === section) {
        editor.hover(null);
        return;
      }
      const hoverEl = childOf(section, target);
      editor.hover(hoverEl === editor.selectedEl ? null : hoverEl);
    });

    doc.addEventListener('pointerup', (e) => {
      const ctx = ctxRef.current;
      cellDrag = null;
      if (draw) {
        const gesture = draw;
        draw = null;
        useEditorStore.getState().setMarquee(null);
        useEditorStore.getState().setDrawLine(null);
        useEditorStore.getState().setPendingShapeKind(null);
        if (!ctx) return;
        if (gesture.active) {
          const p1 = { x: gesture.x0, y: gesture.y0 };
          const p2 = { x: e.clientX, y: e.clientY };
          // Connectors take the drag as their endpoints; fill shapes as box.
          insertShape(
            ctx,
            gesture.kind,
            isLineKind(gesture.kind)
              ? { p1, p2 }
              : {
                  rect: {
                    left: Math.min(p1.x, p2.x),
                    top: Math.min(p1.y, p2.y),
                    width: Math.abs(p2.x - p1.x),
                    height: Math.abs(p2.y - p1.y),
                  },
                },
          );
        } else {
          insertShape(ctx, gesture.kind, { at: { x: e.clientX, y: e.clientY } });
        }
        return;
      }
      if (marquee) {
        const wasActive = marquee.active;
        marquee = null;
        useEditorStore.getState().setMarquee(null);
        if (!wasActive) useEditorStore.getState().select(null); // clean click on canvas
        return;
      }
      const p = press;
      press = null;
      if (!p || !ctx) return;
      useEditorStore.getState().setSnapGuides(null);
      useEditorStore.getState().setDragRect(null);
      if (p.dragging) {
        const pendingDrop = drop;
        drop = null;
        useEditorStore.getState().setDropIndicator(null);
        applyStyle(p.el, { 'pointer-events': null }); // layout-drag transparency off
        if (useEditorStore.getState().layoutMode && pendingDrop) {
          placeInFlow(ctx, p.el, pendingDrop.parent, pendingDrop.before);
        } else {
          commit(ctx);
        }
        return;
      }
      // Clean click on an already-selected element → activate its editor.
      if (p.wasSelected) {
        activate(p.el, { x: e.clientX, y: e.clientY }, p.target);
      }
    });

    doc.addEventListener('pointercancel', finalizePress);

    doc.addEventListener('dblclick', (e) => {
      const target = e.target as Element;
      if (!section.contains(target)) return;
      // Double-click an image → open the Image tab and enter mask mode.
      const img = target.closest('img');
      if (img && section.contains(img)) {
        e.preventDefault();
        const store = useEditorStore.getState();
        store.select(img as HTMLElement);
        store.setRightTab('image');
        store.setMaskEl(img as HTMLElement);
        return;
      }
      const pre = target.closest('pre');
      if (pre && section.contains(pre) && pre !== section) {
        e.preventDefault();
        useEditorStore.getState().setCodeEditEl(pre as HTMLElement);
        return;
      }
      // Double-click on a connector edits its midpoint label.
      const shapeSvg = target.closest('[data-re-shape]');
      if (shapeSvg && section.contains(shapeSvg) && isConnectorEl(shapeSvg)) {
        e.preventDefault();
        const label = ensureShapeLabel(shapeSvg as HTMLElement);
        if (label) startSession(label, { x: e.clientX, y: e.clientY });
        return;
      }
      const editable = textEditableFrom(target, section);
      if (editable && editable !== sessionRef.current?.el) {
        e.preventDefault();
        startSession(editable, { x: e.clientX, y: e.clientY });
      }
    });

    // Spreadsheet paste outside a text session: clipboard carrying a table
    // (Excel/Sheets HTML flavor) or TSV becomes a NEW table on the slide.
    doc.addEventListener('paste', (e: ClipboardEvent) => {
      // sessionRef can go stale after an Escape-exit — the store is truth.
      if (useEditorStore.getState().sessionEl) return; // sessions own their paste
      const ctx = ctxRef.current;
      if (!ctx) return;
      const html = e.clipboardData?.getData('text/html') ?? '';
      const text = e.clipboardData?.getData('text/plain') ?? '';
      const data = (html ? parseClipboardTable(html) : null) ?? (text ? parseTsv(text) : null);
      if (!data) return;
      e.preventDefault();
      // Anchor on the selection's TOP-LEVEL container — inserting after a
      // cell would nest the new table inside the old one's row.
      const sel = useEditorStore.getState().selectedEl;
      const anchor = sel && section.contains(sel) ? childOf(section, sel) : null;
      insertTableFromData(ctx, anchor, data);
    });

    doc.addEventListener('pointerleave', () => useEditorStore.getState().hover(null));

    // Toolbar formatting state + live selection box while typing.
    doc.addEventListener('selectionchange', () => useEditorStore.getState().bump());
    section.addEventListener('input', () => useEditorStore.getState().bump());

    doc.addEventListener('keydown', (e) => {
      const editor = useEditorStore.getState();
      const ctx = ctxRef.current;
      const mod = e.ctrlKey || e.metaKey;
      const inSession = !!sessionRef.current;

      // Session-boundary shortcuts need the session committed/dropped FIRST —
      // that ordering is interaction logic, not a command, so it stays here.
      if (inSession && mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        endSession(true);
        void useDeckStore.getState().save();
        return;
      }
      if (inSession && mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        endSession(true);
        useDeckStore.temporal.getState().undo();
        return;
      }
      if (inSession && ((mod && e.shiftKey && e.key.toLowerCase() === 'z') || (mod && e.key.toLowerCase() === 'y'))) {
        e.preventDefault();
        endSession(false);
        useDeckStore.temporal.getState().redo();
        return;
      }

      // Selection navigation & activation — interaction logic, not commands.
      if (!inSession && ctx) {
        const selected = editor.selectedEl;
        if (e.key === 'Escape' && editor.pendingShapeKind) {
          draw = null;
          editor.setMarquee(null);
          editor.setDrawLine(null);
          editor.setPendingShapeKind(null);
          return;
        }
        if (e.key === 'Escape' && selected) {
          const parent = selected.parentElement;
          editor.select(parent && parent !== ctx.section ? parent : null);
          return;
        }
        if (e.key === 'Enter' && selected) {
          e.preventDefault();
          activate(selected);
          return;
        }
        // Arrow-key nudge for freely positioned elements (1px, Shift = 10px).
        if (
          selected &&
          isAbsolute(selected) &&
          ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)
        ) {
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
          const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
          // Measured, not parseInt(style.left): hand-authored positions may
          // be % or unset — nudge from where the element actually IS.
          const r = stageRect(ctx, selected);
          writeStageRect(ctx, selected, { left: r.left + dx, top: r.top + dy });
          commit(ctx);
          return;
        }
      }

      // Everything else is a command — one dispatcher for all shortcuts.
      if (dispatchShortcut(e, inSession)) e.preventDefault();
    });
  }

  /**
   * Replicate reveal's centering: measured top offset on a CSS variable
   * (never inline on the section — nothing to strip at serialization).
   */
  function recenter() {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const slides = ctx.section.parentElement as HTMLElement | null;
    if (!slides) return;
    const next =
      !meta.config.center || ctx.section.style.height
        ? '0px'
        : `${Math.max(0, (height - ctx.section.offsetHeight) / 2)}px`;
    if (slides.style.getPropertyValue('--re-center-top') === next) return;
    slides.style.setProperty('--re-center-top', next);
    // The offset shift moves everything on the slide — overlay chrome
    // (selection box on a just-inserted element) must recompute its rects.
    useEditorStore.getState().bump();
  }

  function onFrameLoad() {
    const doc = iframeRef.current?.contentDocument;
    const section = doc?.getElementById('re-stage') as HTMLElement | null;
    if (!doc || !section) return;
    const ctx: StageCtx = {
      doc,
      section,
      get slideId() {
        return slideRef.current?.id ?? '';
      },
      markClean(source) {
        cleanSource.current = source;
      },
    };
    ctxRef.current = ctx;
    useEditorStore.getState().setCtx(ctx);
    useEditorStore.getState().setStartSession(startSession);
    useEditorStore.getState().setEndSession(endSession);
    doc.body.toggleAttribute('data-re-layout', useEditorStore.getState().layoutMode);
    wireInteractions(doc, section);
    // Content height changes (typing, inserts, unpinning, late fonts) move
    // the centered offset — the observer keeps it true.
    new ResizeObserver(recenter).observe(section);
    doc.defaultView?.document.fonts?.ready.then(recenter).catch(() => undefined);
    cleanSource.current = null; // force injection
    inject();
  }

  function inject() {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const { section, doc } = ctx;
    endSession(false);
    useEditorStore.getState().reset();

    for (const name of section.getAttributeNames()) {
      if (name !== 'id') section.removeAttribute(name);
    }
    section.className = 'present';
    section.removeAttribute('style');
    const slide = slideRef.current;
    if (!slide) {
      section.innerHTML = '';
      cleanSource.current = null;
      return;
    }
    const parsed = slideElement(slide.source);
    if (!parsed) return;
    for (const attr of parsed.attributes) {
      if (attr.name === 'class') section.className = `${attr.value} present`;
      else section.setAttribute(attr.name, attr.value);
    }
    section.innerHTML = parsed.innerHTML;
    hydrateCodeBlocks(section);
    showAllFragments(section);
    // draggable=false kills native image DnD (serialization strips the attr).
    section.querySelectorAll('img').forEach((img) => {
      (img as HTMLImageElement).draggable = false;
    });
    const bg =
      parsed.getAttribute('data-background-color') ??
      parsed.getAttribute('data-background') ??
      '';
    const bgImage = parsed.getAttribute('data-background-image');
    doc.body.style.background = bg;
    doc.body.style.backgroundImage = bgImage ? `url("${bgImage}")` : '';
    doc.body.style.backgroundSize = bgImage ? 'cover' : '';
    doc.body.style.backgroundPosition = bgImage ? 'center' : '';
    cleanSource.current = slide.source;
    recenter();
  }

  // Rebuild the stage DOM when the slide changes externally (slide switch,
  // undo/redo, sorter ops) — but not on our own commit echo.
  useEffect(() => {
    if (!ctxRef.current) return;
    if (slide && slide.source === cleanSource.current) return;
    inject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide?.id, slide?.source]);

  // Mirror layout mode onto the stage document (drives the dashed-outline CSS).
  const layoutMode = useEditorStore((s) => s.layoutMode);
  useEffect(() => {
    ctxRef.current?.doc.body.toggleAttribute('data-re-layout', layoutMode);
  }, [layoutMode]);

  useEffect(
    () => () => {
      endSession(false);
      useEditorStore.getState().setCtx(null);
      useEditorStore.getState().reset();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <iframe
      ref={iframeRef}
      title="Slide editor"
      srcDoc={srcDoc}
      onLoad={onFrameLoad}
      style={{ width, height, border: 'none', display: 'block' }}
    />
  );
}

/** Place the text caret at a document point (after contenteditable is on). */
function placeCaretAt(doc: Document, x: number, y: number): void {
  const d = doc as unknown as {
    caretRangeFromPoint?(x: number, y: number): Range | null;
    caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null;
    createRange(): Range;
  };
  const sel = doc.getSelection();
  if (!sel) return;
  if (d.caretRangeFromPoint) {
    const range = d.caretRangeFromPoint(x, y);
    if (range) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
  } else if (d.caretPositionFromPoint) {
    const pos = d.caretPositionFromPoint(x, y);
    if (pos) {
      const range = doc.createRange();
      range.setStart(pos.offsetNode, pos.offset);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }
}
