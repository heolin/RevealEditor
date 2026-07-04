import { Fragment, useState } from 'react';
import { ActionIcon, Divider, Group, Menu, Paper, Tooltip } from '@mantine/core';
import { IconPlus, IconRotateClockwise } from '@tabler/icons-react';
import { useEditorStore } from '../editorStore';
import { useDeckStore } from '../../state/deckStore';
import {
  collectAnchorSets,
  isAbsolute,
  nearestAnchor,
  rotation,
  setRotation,
  snapEdges,
  snapValue,
  stageRect,
  toAbsolute,
  unrotatedRect,
  writeStageRect,
} from '../geometry';
import { effectiveFragments } from '../fragments';
import {
  SHAPE_ATTR,
  approachDir,
  connectorEndpoints,
  ensureRefId,
  isConnectorEl,
  isShapeEl,
  previewLineSvg,
  readShapeSpec,
  reconcileConnectors,
  renderShapeInto,
  routeMidpoint,
  setAttachment,
  writeConnectorEndpoints,
} from '../shapes';
import { isChartEl, refreshChart } from '../chart/chart';
import { ensureColgroup, resizeColumnPair, tableGrid } from '../table';
import { commit } from '../commands';
import { handlerFor } from '../registry';
import { useEditorContext } from '../actions/context';
import { resolveLayout } from '../actions';
import { getLayout } from '../actions/layouts';
import { ActionControl } from '../actions/ActionControl';
import type { EditorContext } from '../actions/types';

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
  /** Editor-managed rotation (deg); chrome drawn with this box rotates too. */
  rot: number;
}

function boxFor(el: HTMLElement, scale: number): Box {
  const r = el.getBoundingClientRect();
  const rot = rotation(el) ?? 0; // foreign transforms: keep the plain AABB
  if (!rot) {
    return { left: r.left * scale, top: r.top * scale, width: r.width * scale, height: r.height * scale, rot: 0 };
  }
  // Rotated: getBoundingClientRect is the AABB — reconstruct the unrotated
  // box from the layout size centered on the (rotation-invariant) center.
  const w = el.offsetWidth || parseFloat(el.style.width) || r.width;
  const h = el.offsetHeight || parseFloat(el.style.height) || r.height;
  return {
    left: (r.left + r.width / 2 - w / 2) * scale,
    top: (r.top + r.height / 2 - h / 2) * scale,
    width: w * scale,
    height: h * scale,
    rot,
  };
}

/** CSS for a chrome box that hugs (and rotates with) its element. */
function boxStyle(b: Box): React.CSSProperties {
  return {
    left: b.left,
    top: b.top,
    width: b.width,
    height: b.height,
    transform: b.rot ? `rotate(${b.rot}deg)` : undefined,
  };
}

/** Selection/hover chrome + floating toolbar, drawn OVER the scaled stage. */
export function EditorOverlay({ scale }: { scale: number }) {
  useEditorStore((s) => s.docVersion);
  const selectedEl = useEditorStore((s) => s.selectedEl);
  const extraSelected = useEditorStore((s) => s.extraSelected);
  const hoveredEl = useEditorStore((s) => s.hoveredEl);
  const sessionEl = useEditorStore((s) => s.sessionEl);
  const snapGuides = useEditorStore((s) => s.snapGuides);
  const dragRect = useEditorStore((s) => s.dragRect);
  const marquee = useEditorStore((s) => s.marquee);
  const drawLine = useEditorStore((s) => s.drawLine);
  const dropIndicator = useEditorStore((s) => s.dropIndicator);
  const ctx = useEditorContext();

  const target = sessionEl ?? selectedEl;
  const connected = target?.isConnected ? target : null;
  const extras = extraSelected.filter((el) => el.isConnected);

  return (
    <div className="editor-overlay">
      {hoveredEl?.isConnected && hoveredEl !== connected && (
        <div className="hover-outline" style={boxStyle(boxFor(hoveredEl, scale))} />
      )}
      <FragmentBadges scale={scale} />
      {extras.map((el, i) => (
        <div key={i} className="selection-box secondary" style={boxStyle(boxFor(el, scale))} />
      ))}
      {marquee && (
        <div
          className="marquee-box"
          style={{
            left: marquee.x * scale,
            top: marquee.y * scale,
            width: marquee.w * scale,
            height: marquee.h * scale,
          }}
        />
      )}
      {drawLine &&
        (() => {
          const { box, svg } = previewLineSvg(
            drawLine.kind,
            { x: drawLine.x1, y: drawLine.y1 },
            { x: drawLine.x2, y: drawLine.y2 },
          );
          return (
            <div
              className="draw-line-preview"
              style={{
                left: box.left * scale,
                top: box.top * scale,
                width: box.width * scale,
                height: box.height * scale,
              }}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          );
        })()}
      {connected && (
        <>
          {/* Connectors show only their endpoint grips — a box border around
              a line reads as a rectangle, which it is not. */}
          {!isConnectorEl(connected) && (
            <div
              className={`selection-box${sessionEl ? ' editing' : ''}`}
              style={
                // During a drag, the box comes from the exact values the drag
                // wrote — measuring the iframe returns the previous layout.
                dragRect
                  ? boxStyle({
                      left: dragRect.left * scale,
                      top: dragRect.top * scale,
                      width: dragRect.width * scale,
                      height: dragRect.height * scale,
                      rot: rotation(connected) ?? 0,
                    })
                  : boxStyle(boxFor(connected, scale))
              }
            >
              {sessionEl && <span className="selection-label">EDIT</span>}
            </div>
          )}
          {!sessionEl &&
            extras.length === 0 &&
            (isConnectorEl(connected) && isAbsolute(connected) ? (
              <EndpointHandles el={connected} scale={scale} />
            ) : (
              <>
                <ResizeHandles el={connected} scale={scale} />
                <RotationHandle el={connected} scale={scale} />
              </>
            ))}
          {/* During text sessions the contextual textBar is THE toolbar. */}
          {!sessionEl && <FloatingToolbar ctx={ctx} box={boxFor(connected, scale)} />}
          {!dragRect &&
            (() => {
              // Column grips whenever the selection or session lives in a
              // table (the cell session is exactly when you want them).
              const table = connected.closest('table');
              return table ? <ColumnResizeGrips table={table as HTMLTableElement} scale={scale} /> : null;
            })()}
        </>
      )}
      {dropIndicator && (
        <div
          className="drop-indicator"
          style={{
            left: dropIndicator.x * scale,
            top: dropIndicator.y * scale,
            width: Math.max(2, dropIndicator.w * scale),
            height: Math.max(2, dropIndicator.h * scale),
          }}
        />
      )}
      {snapGuides?.x != null && (
        <div className="snap-guide vertical" style={{ left: snapGuides.x * scale }} />
      )}
      {snapGuides?.y != null && (
        <div className="snap-guide horizontal" style={{ top: snapGuides.y * scale }} />
      )}
      <AnchorDots scale={scale} />
      <StageContextMenu ctx={ctx} scale={scale} />
    </div>
  );
}

/** Right-click menu at the pointer, rendered from the context layout. */
function StageContextMenu({ ctx, scale }: { ctx: EditorContext; scale: number }) {
  const pos = useEditorStore((s) => s.contextMenu);
  if (!pos) return null;
  const groups = resolveLayout(getLayout('context'), ctx);
  if (groups.length === 0) return null;
  const close = () => useEditorStore.getState().setContextMenu(null);

  return (
    <Menu opened onClose={close} position="bottom-start" withinPortal shadow="md">
      <Menu.Target>
        <div
          className="context-menu-anchor"
          style={{ left: pos.x * scale, top: pos.y * scale }}
        />
      </Menu.Target>
      <Menu.Dropdown>
        {groups.map((group, gi) => (
          <Fragment key={gi}>
            {gi > 0 && <Menu.Divider />}
            {group.map((action) => (
              <ActionControl key={action.id} action={action} ctx={ctx} variant="menu" />
            ))}
          </Fragment>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

const TOOLBAR_HEIGHT = 40;

/** Config-driven quick toolbar following the selection (docs/TOOLBARS.md). */
function FloatingToolbar({ ctx, box }: { ctx: EditorContext; box: Box }) {
  const groups = resolveLayout(getLayout('floating'), ctx);
  if (groups.length === 0) return null;
  const top =
    box.top - TOOLBAR_HEIGHT - 6 >= 0 ? box.top - TOOLBAR_HEIGHT - 6 : box.top + box.height + 6;
  const left = Math.max(4, box.left);

  return (
    <Paper
      className="floating-toolbar"
      shadow="md"
      p={4}
      withBorder
      style={{ top, left }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <Group gap={4} wrap="nowrap">
        {groups.map((group, gi) => (
          <Fragment key={gi}>
            {gi > 0 && <Divider orientation="vertical" />}
            {group.map((action) => (
              <ActionControl key={action.id} action={action} ctx={ctx} variant="toolbar" />
            ))}
          </Fragment>
        ))}
      </Group>
    </Paper>
  );
}

/** The "+" insert menu — same registry, menu variant. */
export function InsertMenu() {
  const ctx = useEditorContext();
  const groups = resolveLayout(getLayout('insertMenu'), ctx);
  if (!ctx.stage) return null;
  return (
    <Menu withinPortal position="bottom-start">
      <Menu.Target>
        <Tooltip label="Insert">
          <ActionIcon
            variant="subtle"
            color="gray"
            disabled={groups.length === 0}
            aria-label="Insert"
          >
            <IconPlus size={16} />
          </ActionIcon>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown>
        {groups.map((group, gi) => (
          <Fragment key={gi}>
            {gi > 0 && <Menu.Divider />}
            {group.map((action) => (
              <ActionControl key={action.id} action={action} ctx={ctx} variant="menu" />
            ))}
          </Fragment>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

function FragmentBadges({ scale }: { scale: number }) {
  const ctx = useEditorStore((s) => s.ctx);
  const sessionEl = useEditorStore((s) => s.sessionEl);
  if (!ctx || sessionEl) return null;
  const fragments = effectiveFragments(ctx.section);
  return (
    <>
      {fragments.map((el, i) => {
        const box = boxFor(el, scale);
        return (
          <button
            key={i}
            className="fragment-badge"
            style={{ left: box.left - 9, top: box.top - 9 }}
            title="Fragment — click to select"
            onClick={() => useEditorStore.getState().select(el)}
          >
            {i + 1}
          </button>
        );
      })}
    </>
  );
}

const HANDLE_CURSORS: Record<string, string> = {
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
  ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize',
};

function ResizeHandles({ el, scale }: { el: HTMLElement; scale: number }) {
  const ctx = useEditorStore((s) => s.ctx);
  if (!ctx) return null;
  const capability = handlerFor(el).capabilities.resize;
  if (capability === 'none') return null;
  // Rotated elements resize in their LOCAL frame (R2): deltas are projected
  // onto the rotated axes and the opposite corner/edge stays pinned in
  // world space. Foreign transforms (hand-authored) keep the plain path.
  const rot = rotation(el) || 0;
  const absolute = isAbsolute(el);
  // Sized elements (images, shapes, charts) always show all 8 handles — in
  // flow layout the n/w handles just resize toward the anchored edge.
  const handles =
    capability === 'width'
      ? absolute ? ['e', 'w'] : ['e']
      : ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

  const box = boxFor(el, scale);
  const rad = (rot * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  function startResize(handle: string, down: React.PointerEvent) {
    down.preventDefault();
    down.stopPropagation();
    if (!ctx) return;
    // Capture the pointer on the handle: without it, the moment the pointer
    // crosses onto the stage iframe the parent window stops receiving
    // events (iframes swallow them) and the resize goes dead.
    const grip = down.currentTarget as HTMLElement;
    grip.setPointerCapture(down.pointerId);
    const start = unrotatedRect(ctx, el);
    const design = useDeckStore.getState().meta?.config ?? { width: 960, height: 700 };
    const edges = snapEdges(ctx, el, design.width, design.height);
    const isImg = el.tagName === 'IMG';
    const ratio = start.width / Math.max(1, start.height);
    const x0 = down.clientX;
    const y0 = down.clientY;
    // Rotated: pin the anchor OPPOSITE the handle where it sits in world
    // space — fx/fy are its local offset factors from the center.
    const fx = handle.includes('w') ? 0.5 : handle.includes('e') ? -0.5 : 0;
    const fy = handle.includes('n') ? 0.5 : handle.includes('s') ? -0.5 : 0;
    const c0 = { x: start.left + start.width / 2, y: start.top + start.height / 2 };
    const fixed = {
      x: c0.x + fx * start.width * cos - fy * start.height * sin,
      y: c0.y + fx * start.width * sin + fy * start.height * cos,
    };

    function onMove(e: PointerEvent) {
      const dx = (e.clientX - x0) / scale;
      const dy = (e.clientY - y0) / scale;
      let { left, top, width: w, height: h } = start;
      const aspectLocked = isImg && (e.shiftKey || handle.length === 2);
      let guideX: number | null = null;
      let guideY: number | null = null;
      if (rot) {
        // Local-frame resize: pointer delta rotated by -θ; no edge snapping
        // (snap lines are slide-axis-aligned — meaningless mid-rotation).
        const dlx = dx * cos + dy * sin;
        const dly = -dx * sin + dy * cos;
        w += handle.includes('e') ? dlx : handle.includes('w') ? -dlx : 0;
        if (!aspectLocked) h += handle.includes('s') ? dly : handle.includes('n') ? -dly : 0;
        if (aspectLocked) h = w / ratio;
        w = Math.max(16, w);
        h = Math.max(16, h);
        // The pinned anchor dictates the new center → new left/top.
        const ox = fx * w;
        const oy = fy * h;
        left = fixed.x - (ox * cos - oy * sin) - w / 2;
        top = fixed.y - (ox * sin + oy * cos) - h / 2;
      } else {
        // Snap the edge being dragged — same guides and threshold as moving.
        if (handle.includes('e')) {
          const snap = snapValue(start.left + start.width + dx, edges.xs, 6);
          w = snap.v - start.left;
          guideX = snap.guide;
        }
        if (handle.includes('w')) {
          const snap = snapValue(start.left + dx, edges.xs, 6);
          left = snap.v;
          w = start.width + (start.left - snap.v);
          guideX = snap.guide;
        }
        if (handle.includes('s') && !aspectLocked) {
          const snap = snapValue(start.top + start.height + dy, edges.ys, 6);
          h = snap.v - start.top;
          guideY = snap.guide;
        }
        if (handle.includes('n') && !aspectLocked) {
          const snap = snapValue(start.top + dy, edges.ys, 6);
          top = snap.v;
          h = start.height + (start.top - snap.v);
          guideY = snap.guide;
        }
        if (aspectLocked) h = w / ratio;
        w = Math.max(16, w);
        h = Math.max(16, h);
      }
      useEditorStore
        .getState()
        .setSnapGuides(guideX != null || guideY != null ? { x: guideX, y: guideY } : null);
      // Corner drags size both axes on elements that own their box: sized
      // media always did; text boxes joined when they got 8 handles.
      const sized = isImg || isShapeEl(el) || isChartEl(el) || handlerFor(el).type === 'text';
      const target: { left?: number; top?: number; width: number; height?: number } = { width: w };
      if (handle.includes('s') || handle.includes('n') || (sized && handle.length === 2)) {
        target.height = h;
      }
      if (absolute) {
        target.left = left;
        target.top = top;
      }
      writeStageRect(ctx!, el, target);
      // Self-describing blocks re-bake their render at the new size.
      if (isShapeEl(el)) renderShapeInto(el);
      else if (isChartEl(el) && ctx) refreshChart(ctx, el);
      // Resizing moves this element's anchors — attached arrows follow live.
      reconcileConnectors(ctx!);
      useEditorStore.getState().bump();
    }
    function onUp() {
      grip.removeEventListener('pointermove', onMove);
      grip.removeEventListener('pointerup', onUp);
      grip.removeEventListener('pointercancel', onUp);
      useEditorStore.getState().setSnapGuides(null);
      if (ctx) commit(ctx);
    }
    // With capture active, all pointer events retarget to the grip.
    grip.addEventListener('pointermove', onMove);
    grip.addEventListener('pointerup', onUp);
    grip.addEventListener('pointercancel', onUp);
  }

  // Handle positions: on the unrotated box, then rotated around its center.
  const c = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  return (
    <>
      {handles.map((h) => {
        let px = c.x;
        let py = c.y;
        if (h.includes('n')) py = box.top;
        else if (h.includes('s')) py = box.top + box.height;
        if (h.includes('w')) px = box.left;
        else if (h.includes('e')) px = box.left + box.width;
        if (rot) {
          const dxp = px - c.x;
          const dyp = py - c.y;
          px = c.x + dxp * cos - dyp * sin;
          py = c.y + dxp * sin + dyp * cos;
        }
        const style: React.CSSProperties = { cursor: HANDLE_CURSORS[h], left: px - 4, top: py - 4 };
        return (
          <div key={h} className="resize-handle" style={style} onPointerDown={(e) => startResize(h, e)} />
        );
      })}
    </>
  );
}

/**
 * Column-boundary grips on the selected (or session-hosting) table: drag a
 * boundary to redistribute the neighboring pair of <colgroup> widths.
 */
function ColumnResizeGrips({ table, scale }: { table: HTMLTableElement; scale: number }) {
  const ctx = useEditorStore((s) => s.ctx);
  if (!ctx) return null;
  const grid = tableGrid(table);
  const colCount = grid[0]?.length ?? 0;
  if (colCount < 2) return null;
  const tRect = stageRect(ctx, table);
  const boundaries: number[] = [];
  for (let c = 0; c < colCount - 1; c++) {
    // Any cell whose rect ENDS at column c marks the boundary's x.
    const owner = grid
      .map((row) => row[c])
      .find((cell, r) => cell && grid[r][c + 1] !== cell);
    if (!owner) continue;
    const r = stageRect(ctx, owner);
    boundaries.push(r.left + r.width);
  }

  function startDrag(index: number, down: React.PointerEvent) {
    down.preventDefault();
    down.stopPropagation();
    if (!ctx) return;
    const grip = down.currentTarget as HTMLElement;
    grip.setPointerCapture(down.pointerId);
    const cols = ensureColgroup(table);
    const startWidths = cols.map((c) => parseFloat(c.style.width) || 0);
    const tableWidth = stageRect(ctx, table).width;
    const x0 = down.clientX;

    function onMove(e: PointerEvent) {
      const deltaPct = (((e.clientX - x0) / scale) / tableWidth) * 100;
      resizeColumnPair(cols, index, startWidths, deltaPct);
      useEditorStore.getState().bump();
    }
    function onUp() {
      grip.removeEventListener('pointermove', onMove);
      grip.removeEventListener('pointerup', onUp);
      grip.removeEventListener('pointercancel', onUp);
      if (ctx) commit(ctx);
    }
    grip.addEventListener('pointermove', onMove);
    grip.addEventListener('pointerup', onUp);
    grip.addEventListener('pointercancel', onUp);
  }

  return (
    <>
      {boundaries.map((x, i) => (
        <div
          key={i}
          className="col-resize-grip"
          title="Drag to resize columns"
          style={{ left: x * scale - 3, top: tRect.top * scale, height: tRect.height * scale }}
          onPointerDown={(e) => startDrag(i, e)}
        />
      ))}
    </>
  );
}

/** Overlay px between the box's top-right corner and the rotation grip. */
const ROT_GRIP_GAP = 14;

/**
 * Rotation grip above the selection: drag rotates the element around its
 * center (inline `transform: rotate(Ndeg)` — plain CSS, presents anywhere).
 * Soft-snaps to the 90° cardinals within 3°; Shift = strict 15° steps.
 * Foreign transforms (hand-authored matrix/scale) hide the grip — the
 * editor never rewrites transforms it didn't create.
 */
function RotationHandle({ el, scale }: { el: HTMLElement; scale: number }) {
  const ctx = useEditorStore((s) => s.ctx);
  const [liveDeg, setLiveDeg] = useState<number | null>(null);
  if (!ctx) return null;
  const rot = rotation(el);
  if (rot === null) return null;
  const box = boxFor(el, scale);
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  // The grip rides the rotated TOP-RIGHT corner, offset diagonally outward.
  const a = (rot * Math.PI) / 180;
  const lx = box.width / 2 + ROT_GRIP_GAP;
  const ly = -(box.height / 2 + ROT_GRIP_GAP);
  const gx = cx + lx * Math.cos(a) - ly * Math.sin(a);
  const gy = cy + lx * Math.sin(a) + ly * Math.cos(a);

  function startRotate(down: React.PointerEvent) {
    down.preventDefault();
    down.stopPropagation();
    if (!ctx) return;
    const grip = down.currentTarget as HTMLElement;
    grip.setPointerCapture(down.pointerId);
    if (!isAbsolute(el)) {
      // Rotation implies free positioning — same rule as align and drag.
      const design = useDeckStore.getState().meta?.config ?? { width: 960, height: 700 };
      toAbsolute(ctx, el, design.height);
    }
    // Element center in WINDOW coords: overlay coords are drawn over the
    // stage iframe at its origin, so add the iframe's window offset.
    const frame = ctx.doc.defaultView!.frameElement!.getBoundingClientRect();
    const wx = frame.left + cx;
    const wy = frame.top + cy;
    // The grip's angular home (top-right diagonal) at rotation 0 — dragging
    // it to any angle rotates the element by the difference.
    const base = (Math.atan2(ly, lx) * 180) / Math.PI;

    function onMove(e: PointerEvent) {
      let deg = (Math.atan2(e.clientY - wy, e.clientX - wx) * 180) / Math.PI - base;
      if (e.shiftKey) {
        deg = Math.round(deg / 15) * 15;
      } else {
        const cardinal = Math.round(deg / 90) * 90;
        if (Math.abs(deg - cardinal) <= 3) deg = cardinal;
      }
      setRotation(el, deg);
      setLiveDeg(((Math.round(deg) % 360) + 360) % 360);
      useEditorStore.getState().bump();
    }
    function onUp() {
      grip.removeEventListener('pointermove', onMove);
      grip.removeEventListener('pointerup', onUp);
      grip.removeEventListener('pointercancel', onUp);
      setLiveDeg(null);
      if (ctx) commit(ctx);
    }
    grip.addEventListener('pointermove', onMove);
    grip.addEventListener('pointerup', onUp);
    grip.addEventListener('pointercancel', onUp);
  }

  return (
    <>
      <div
        className="rotate-handle"
        style={{ left: gx, top: gy }}
        title="Rotate (Shift: 15° steps)"
        onPointerDown={startRotate}
      >
        <IconRotateClockwise size={12} />
      </div>
      {liveDeg !== null && (
        <div className="rotate-badge" style={{ left: gx + 14, top: gy - 10 }}>
          {liveDeg}°
        </div>
      )}
    </>
  );
}

/** How close (slide px) an endpoint must get to an anchor point to snap. */
const ANCHOR_SNAP_RANGE = 8;

/**
 * Two round grips on a line/arrow's endpoints — connectors reshape by
 * endpoint, not by box. Dragging snaps to sibling anchor points (8 per box);
 * a spec-level snapGap backs the endpoint off along the line so arrows can
 * stop short of the box they point at.
 */
function EndpointHandles({ el, scale }: { el: HTMLElement; scale: number }) {
  const ctx = useEditorStore((s) => s.ctx);
  if (!ctx) return null;
  const { p1, p2 } = connectorEndpoints(ctx, el);
  const spec = readShapeSpec(el);

  function startDrag(which: 'p1' | 'p2', down: React.PointerEvent) {
    down.preventDefault();
    down.stopPropagation();
    if (!ctx) return;
    // Capture on the grip: iframes swallow pointer events the moment the
    // pointer crosses onto the stage (same trick as ResizeHandles).
    const grip = down.currentTarget as HTMLElement;
    grip.setPointerCapture(down.pointerId);
    const start = connectorEndpoints(ctx, el);
    const moving0 = start[which];
    const fixed = which === 'p1' ? start.p2 : start.p1;
    const gap = readShapeSpec(el)?.snapGap ?? 0;
    // Snap targets measured once per gesture — they can't move mid-drag.
    const sets = collectAnchorSets(ctx, el);
    const x0 = down.clientX;
    const y0 = down.clientY;
    // Where the endpoint last snapped — released on an anchor ⇒ attach,
    // released free ⇒ detach. A clean click (no move) must change nothing.
    let lastAnchor: ReturnType<typeof nearestAnchor> = null;
    let moved = false;

    function onMove(e: PointerEvent) {
      moved = true;
      const raw = {
        x: moving0.x + (e.clientX - x0) / scale,
        y: moving0.y + (e.clientY - y0) / scale,
      };
      const anchor = nearestAnchor(raw, sets, ANCHOR_SNAP_RANGE);
      lastAnchor = anchor;
      let p: { x: number; y: number } = anchor ?? raw;
      if (anchor && gap > 0 && Math.hypot(fixed.x - anchor.x, fixed.y - anchor.y) > gap) {
        // Back off along the route's approach segment (axis-aligned for elbows).
        const dir = approachDir(readShapeSpec(el)!, anchor, fixed);
        p = { x: anchor.x + dir.x * gap, y: anchor.y + dir.y * gap };
      }
      // Show the anchor dots of the box under the pointer (small halo so
      // they appear as you approach, not only once inside).
      const hovered = sets.find(
        (s) =>
          raw.x >= s.rect.left - 12 &&
          raw.x <= s.rect.left + s.rect.width + 12 &&
          raw.y >= s.rect.top - 12 &&
          raw.y <= s.rect.top + s.rect.height + 12,
      );
      useEditorStore
        .getState()
        .setAnchorDots(
          hovered || anchor ? { points: hovered?.points ?? [], active: anchor } : null,
        );
      writeConnectorEndpoints(ctx!, el, which === 'p1' ? p : fixed, which === 'p1' ? fixed : p);
      useEditorStore.getState().bump();
    }
    function onUp() {
      grip.removeEventListener('pointermove', onMove);
      grip.removeEventListener('pointerup', onUp);
      grip.removeEventListener('pointercancel', onUp);
      useEditorStore.getState().setAnchorDots(null);
      if (!ctx) return;
      if (moved) {
        // Dropped on an anchor → glue this end to it (stamping a stable id
        // on the target); dropped free → release any previous attachment.
        setAttachment(
          el,
          which === 'p1' ? 'from' : 'to',
          lastAnchor ? { ref: ensureRefId(ctx.section, lastAnchor.el), anchor: lastAnchor.id } : null,
        );
      }
      commit(ctx);
    }
    grip.addEventListener('pointermove', onMove);
    grip.addEventListener('pointerup', onUp);
    grip.addEventListener('pointercancel', onUp);
  }

  // Elbow/curve routes get a MID grip: drag it to move the bend segment or
  // bow the curve through the pointer.
  const routed = spec && (spec.route === 'elbow' || spec.route === 'curve');
  const mid = spec && routed ? routeMidpoint(spec, p1, p2) : null;

  function startMidDrag(down: React.PointerEvent) {
    down.preventDefault();
    down.stopPropagation();
    if (!ctx || !spec) return;
    const grip = down.currentTarget as HTMLElement;
    grip.setPointerCapture(down.pointerId);
    const { p1: a, p2: b } = connectorEndpoints(ctx, el);
    const route = spec.route;
    const x0 = down.clientX;
    const y0 = down.clientY;
    const start = routeMidpoint(spec, a, b);

    function onMove(e: PointerEvent) {
      const p = {
        x: start.x + (e.clientX - x0) / scale,
        y: start.y + (e.clientY - y0) / scale,
      };
      const current = readShapeSpec(el);
      if (!current) return;
      if (route === 'curve') {
        // Bow so the curve passes through the pointer at t = 0.5.
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const perp = ((p.x - (a.x + b.x) / 2) * -dy + (p.y - (a.y + b.y) / 2) * dx) / len;
        const bow = Math.max(-1.5, Math.min(1.5, Math.round(((2 * perp) / len) * 1000) / 1000));
        el.setAttribute(SHAPE_ATTR, JSON.stringify({ ...current, bow }));
      } else {
        // Slide the elbow's middle segment along the dominant axis.
        const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
        const t = horizontal ? (p.x - a.x) / (b.x - a.x || 1) : (p.y - a.y) / (b.y - a.y || 1);
        const bend = Math.max(0.05, Math.min(0.95, Math.round(t * 1000) / 1000));
        el.setAttribute(SHAPE_ATTR, JSON.stringify({ ...current, bend }));
      }
      renderShapeInto(el);
      useEditorStore.getState().bump();
    }
    function onUp() {
      grip.removeEventListener('pointermove', onMove);
      grip.removeEventListener('pointerup', onUp);
      grip.removeEventListener('pointercancel', onUp);
      if (ctx) commit(ctx);
    }
    grip.addEventListener('pointermove', onMove);
    grip.addEventListener('pointerup', onUp);
    grip.addEventListener('pointercancel', onUp);
  }

  return (
    <>
      {(
        [
          ['p1', p1, spec?.from],
          ['p2', p2, spec?.to],
        ] as const
      ).map(([key, p, attachment]) => (
        <div
          key={key}
          className={`endpoint-handle${attachment ? ' attached' : ''}`}
          title={attachment ? 'Linked — drag away to unlink' : undefined}
          style={{ left: p.x * scale, top: p.y * scale }}
          onPointerDown={(e) => startDrag(key, e)}
        />
      ))}
      {mid && (
        <div
          className="endpoint-handle mid"
          title={spec?.route === 'curve' ? 'Drag to bow the curve' : 'Drag to move the bend'}
          style={{ left: mid.x * scale, top: mid.y * scale }}
          onPointerDown={startMidDrag}
        />
      )}
    </>
  );
}

/** Anchor dots during a connector-endpoint drag; the snapped one lights up. */
function AnchorDots({ scale }: { scale: number }) {
  const dots = useEditorStore((s) => s.anchorDots);
  if (!dots) return null;
  return (
    <>
      {dots.points.map((p, i) => (
        <div
          key={i}
          className="anchor-dot"
          style={{ left: p.x * scale, top: p.y * scale }}
        />
      ))}
      {dots.active && (
        <div
          className="anchor-dot active"
          style={{ left: dots.active.x * scale, top: dots.active.y * scale }}
        />
      )}
    </>
  );
}
