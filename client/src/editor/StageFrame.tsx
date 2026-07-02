import { useEffect, useMemo, useRef } from 'react';
import type { Slide } from '../model/deck';
import type { DeckMeta } from '../state/deckStore';
import { useDeckStore } from '../state/deckStore';
import { useEditorStore } from './editorStore';
import { slideElement } from '../model/deck';
import { resolveDeckUrl, themeUrl } from '../api/client';
import { TextSession } from './TextSession';
import { handlerFor, textEditableFrom } from './registry';
import { hydrateCodeBlocks } from './codeHighlight';
import { applyStyle, isAbsolute, slideRect, snapEdges, snapRect, toAbsolute } from './geometry';
import { showAllFragments } from './fragments';
import { nextCell } from './table';
import {
  type StageCtx,
  commit,
  copyElement,
  cutElement,
  deleteElement,
  duplicateElement,
  pasteElement,
} from './commands';

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

  const { width, height } = meta.config;

  const srcDoc = useMemo(() => {
    const dir = meta.path.includes('/')
      ? meta.path.slice(0, meta.path.lastIndexOf('/') + 1)
      : '';
    const userSheets = meta.stylesheets
      .filter((href) => !/reveal\.css|theme\/[\w-]+\.css/.test(href))
      .map((href) => `<link rel="stylesheet" href="${resolveDeckUrl(meta.path, href)}">`)
      .join('\n');
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<base href="/files/${dir}">
<link rel="stylesheet" href="/vendor/reveal.js/dist/reveal.css">
<link rel="stylesheet" href="${themeUrl(meta.path, meta.theme, meta.themeHref)}">
<link rel="stylesheet" href="/vendor/reveal.js/plugin/highlight/monokai.css">
${userSheets}
${meta.managedCss ? `<style>${meta.managedCss}</style>` : ''}
<style>
  html, body { margin: 0; overflow: hidden; width: 100%; height: 100%; }
  .reveal { position: relative; width: 100%; height: 100%; overflow: hidden; }
  .reveal .slides { position: absolute; inset: 0; width: ${width}px; height: ${height}px; }
  /* Replicate reveal's centered layout statically — the runtime never runs
     here. position:relative makes the section the containing block for
     absolutely positioned elements, exactly like reveal's own layout. */
  .reveal .slides > section.present {
    position: relative;
    display: flex !important;
    flex-direction: column;
    justify-content: center;
    width: 100%;
    height: 100%;
    top: 0;
  }
  /* A pinned-height section flows from the top in the runtime — mirror it. */
  .reveal .slides > section.present[style*="height"] { justify-content: flex-start; }
  aside.notes { display: none !important; }
  [contenteditable]:focus { outline: none; }
  .reveal .slides section :where(h1,h2,h3,h4,h5,h6,p,ul,ol,blockquote,img,pre,div,figure,table) {
    cursor: default;
  }
</style>
</head>
<body class="reveal-viewport">
<div class="reveal"><div class="slides"><section class="present" id="re-stage"></section></div></div>
</body>
</html>`;
  }, [meta.path, meta.theme, meta.themeHref, meta.stylesheets, meta.managedCss, width, height]);

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
    if (handler.capabilities.textEdit) {
      const editable = textEditableFrom(target ?? el, ctx.section) ?? el;
      startSession(editable, caretPoint);
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

  function wireInteractions(doc: Document, section: HTMLElement) {
    let press: {
      el: HTMLElement;
      wasSelected: boolean;
      target: Element;
      x: number;
      y: number;
      dragging: boolean;
      startLeft: number;
      startTop: number;
    } | null = null;

    doc.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const target = e.target as Element;
      const editor = useEditorStore.getState();
      const session = sessionRef.current;
      if (session) {
        if (session.el.contains(target)) return; // native text editing
        endSession(true);
      }
      if (!section.contains(target) || target === section) {
        editor.select(null);
        return;
      }
      const selected = editor.selectedEl;
      const withinSelected =
        !!selected && selected.isConnected && (selected === target || selected.contains(target));
      const el = withinSelected ? selected! : childOf(section, target);
      if (!el) return;
      if (!withinSelected) editor.select(el);

      const rect = slideRect(ctxRef.current!, el);
      press = {
        el,
        wasSelected: withinSelected,
        target,
        x: e.clientX,
        y: e.clientY,
        dragging: false,
        startLeft: rect.left,
        startTop: rect.top,
      };
    });

    doc.addEventListener('pointermove', (e) => {
      const ctx = ctxRef.current;
      // Drag tracking (iframe coordinates ARE slide-space px — no scale math).
      if (press && ctx) {
        const dx = e.clientX - press.x;
        const dy = e.clientY - press.y;
        if (!press.dragging && Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
          press.dragging = true;
          toAbsolute(ctx, press.el, height);
          const r = slideRect(ctx, press.el);
          press.startLeft = r.left;
          press.startTop = r.top;
        }
        if (press.dragging) {
          e.preventDefault();
          const raw = {
            left: press.startLeft + dx,
            top: press.startTop + dy,
            width: press.el.getBoundingClientRect().width,
            height: press.el.getBoundingClientRect().height,
          };
          const snap = snapRect(raw, snapEdges(ctx, press.el, width, height), SNAP_THRESHOLD);
          applyStyle(press.el, {
            left: `${Math.round(raw.left + snap.dx)}px`,
            top: `${Math.round(raw.top + snap.dy)}px`,
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
      const p = press;
      press = null;
      if (!p || !ctx) return;
      useEditorStore.getState().setSnapGuides(null);
      if (p.dragging) {
        commit(ctx);
        return;
      }
      // Clean click on an already-selected element → activate its editor.
      if (p.wasSelected) {
        activate(p.el, { x: e.clientX, y: e.clientY }, p.target);
      }
    });

    doc.addEventListener('dblclick', (e) => {
      const target = e.target as Element;
      if (!section.contains(target)) return;
      const pre = target.closest('pre');
      if (pre && section.contains(pre) && pre !== section) {
        e.preventDefault();
        useEditorStore.getState().setCodeEditEl(pre as HTMLElement);
        return;
      }
      const editable = textEditableFrom(target, section);
      if (editable && editable !== sessionRef.current?.el) {
        e.preventDefault();
        startSession(editable, { x: e.clientX, y: e.clientY });
      }
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

      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        endSession(true);
        void useDeckStore.getState().save();
        return;
      }
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        endSession(true);
        useDeckStore.temporal.getState().undo();
        return;
      }
      if ((mod && e.shiftKey && e.key.toLowerCase() === 'z') || (mod && e.key.toLowerCase() === 'y')) {
        e.preventDefault();
        endSession(false);
        useDeckStore.temporal.getState().redo();
        return;
      }
      if (inSession || !ctx) return;

      const selected = editor.selectedEl;
      if (e.key === 'Escape') {
        if (!selected) return;
        const parent = selected.parentElement;
        editor.select(parent && parent !== ctx.section ? parent : null);
        return;
      }
      if (!selected) return;

      // Arrow-key nudge for freely positioned elements (1px, Shift = 10px).
      if (isAbsolute(selected) && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        applyStyle(selected, {
          left: `${(parseInt(selected.style.left, 10) || 0) + dx}px`,
          top: `${(parseInt(selected.style.top, 10) || 0) + dy}px`,
        });
        commit(ctx);
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteElement(ctx, selected);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        activate(selected);
      } else if (mod && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        copyElement(selected);
      } else if (mod && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        cutElement(ctx, selected);
      } else if (mod && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        pasteElement(ctx, selected);
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateElement(ctx, selected);
      }
    });
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
    wireInteractions(doc, section);
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
  }

  // Rebuild the stage DOM when the slide changes externally (slide switch,
  // undo/redo, sorter ops) — but not on our own commit echo.
  useEffect(() => {
    if (!ctxRef.current) return;
    if (slide && slide.source === cleanSource.current) return;
    inject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide?.id, slide?.source]);

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
