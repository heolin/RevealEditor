import { Fragment } from 'react';
import { ActionIcon, Divider, Group, Menu, Paper, Tooltip } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useEditorStore } from '../editorStore';
import { useDeckStore } from '../../state/deckStore';
import { applyStyle, isAbsolute, slideRect, snapEdges, snapValue } from '../geometry';
import { effectiveFragments } from '../fragments';
import { isShapeEl, renderShapeInto } from '../shapes';
import { isChartEl, refreshChart } from '../chart/chart';
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
}

function boxFor(el: HTMLElement, scale: number): Box {
  const r = el.getBoundingClientRect();
  return { left: r.left * scale, top: r.top * scale, width: r.width * scale, height: r.height * scale };
}

/** Selection/hover chrome + floating toolbar, drawn OVER the scaled stage. */
export function EditorOverlay({ scale }: { scale: number }) {
  useEditorStore((s) => s.docVersion);
  const selectedEl = useEditorStore((s) => s.selectedEl);
  const hoveredEl = useEditorStore((s) => s.hoveredEl);
  const sessionEl = useEditorStore((s) => s.sessionEl);
  const snapGuides = useEditorStore((s) => s.snapGuides);
  const ctx = useEditorContext();

  const target = sessionEl ?? selectedEl;
  const connected = target?.isConnected ? target : null;

  return (
    <div className="editor-overlay">
      {hoveredEl?.isConnected && hoveredEl !== connected && (
        <div className="hover-outline" style={boxFor(hoveredEl, scale)} />
      )}
      <FragmentBadges scale={scale} />
      {connected && (
        <>
          <div
            className={`selection-box${sessionEl ? ' editing' : ''}`}
            style={boxFor(connected, scale)}
          >
            {sessionEl && <span className="selection-label">EDIT</span>}
          </div>
          {!sessionEl && <ResizeHandles el={connected} scale={scale} />}
          <FloatingToolbar ctx={ctx} box={boxFor(connected, scale)} />
        </>
      )}
      {snapGuides?.x != null && (
        <div className="snap-guide vertical" style={{ left: snapGuides.x * scale }} />
      )}
      {snapGuides?.y != null && (
        <div className="snap-guide horizontal" style={{ top: snapGuides.y * scale }} />
      )}
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
          <ActionIcon variant="subtle" color="gray" disabled={groups.length === 0}>
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
  const absolute = isAbsolute(el);
  // Sized elements (images, shapes, charts) always show all 8 handles — in
  // flow layout the n/w handles just resize toward the anchored edge.
  const handles =
    capability === 'width'
      ? absolute ? ['e', 'w'] : ['e']
      : ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

  const box = boxFor(el, scale);

  function startResize(handle: string, down: React.PointerEvent) {
    down.preventDefault();
    down.stopPropagation();
    if (!ctx) return;
    // Capture the pointer on the handle: without it, the moment the pointer
    // crosses onto the stage iframe the parent window stops receiving
    // events (iframes swallow them) and the resize goes dead.
    const grip = down.currentTarget as HTMLElement;
    grip.setPointerCapture(down.pointerId);
    const start = slideRect(ctx, el);
    const design = useDeckStore.getState().meta?.config ?? { width: 960, height: 700 };
    const edges = snapEdges(ctx, el, design.width, design.height);
    const isImg = el.tagName === 'IMG';
    const ratio = start.width / Math.max(1, start.height);
    const x0 = down.clientX;
    const y0 = down.clientY;

    function onMove(e: PointerEvent) {
      const dx = (e.clientX - x0) / scale;
      const dy = (e.clientY - y0) / scale;
      let { left, top, width: w, height: h } = start;
      const aspectLocked = isImg && (e.shiftKey || handle.length === 2);
      let guideX: number | null = null;
      let guideY: number | null = null;
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
      useEditorStore
        .getState()
        .setSnapGuides(guideX != null || guideY != null ? { x: guideX, y: guideY } : null);
      const sized = isImg || isShapeEl(el) || isChartEl(el);
      const patch: Record<string, string | null> = { width: `${Math.round(w)}px` };
      if (handle.includes('s') || handle.includes('n') || (sized && handle.length === 2)) {
        patch.height = `${Math.round(h)}px`;
      }
      if (absolute) {
        patch.left = `${Math.round(left)}px`;
        patch.top = `${Math.round(top)}px`;
      }
      applyStyle(el, patch);
      // Self-describing blocks re-bake their render at the new size.
      if (isShapeEl(el)) renderShapeInto(el);
      else if (isChartEl(el) && ctx) refreshChart(ctx, el);
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

  return (
    <>
      {handles.map((h) => {
        const style: React.CSSProperties = { cursor: HANDLE_CURSORS[h] };
        if (h.includes('n')) style.top = box.top - 4;
        else if (h.includes('s')) style.top = box.top + box.height - 4;
        else style.top = box.top + box.height / 2 - 4;
        if (h.includes('w')) style.left = box.left - 4;
        else if (h.includes('e')) style.left = box.left + box.width - 4;
        else style.left = box.left + box.width / 2 - 4;
        return (
          <div key={h} className="resize-handle" style={style} onPointerDown={(e) => startResize(h, e)} />
        );
      })}
    </>
  );
}
