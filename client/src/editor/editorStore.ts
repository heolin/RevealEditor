/**
 * Editor-session state: selection, hover, active text session, and a
 * docVersion counter bumped by every mutation so overlay/panels re-measure.
 *
 * Holds live Element references into the stage iframe — deliberately NOT
 * part of the undoable deck store (elements are transient; the deck store's
 * HTML strings are the durable truth).
 */
import { create } from 'zustand';
import type { StageCtx } from './commands';
import type { ShapeKind } from './shapes';
import type { CellRect } from './table';

interface EditorState {
  /** Live stage context for commands/toolbars; null when no stage mounted. */
  ctx: StageCtx | null;
  /** Primary selection (last clicked) — single-selection consumers use this. */
  selectedEl: HTMLElement | null;
  /** Additional selected elements (shift-click / marquee). */
  extraSelected: HTMLElement[];
  /** Marquee rectangle during rubber-band selection, slide-space px. */
  marquee: { x: number; y: number; w: number; h: number } | null;
  /** Live preview while dragging out a line/arrow, endpoints in slide-space px. */
  drawLine: { kind: ShapeKind; x1: number; y1: number; x2: number; y2: number } | null;
  /** Layout mode: dashed containers, drags reparent into flow instead of pinning. */
  layoutMode: boolean;
  /** Insertion indicator during a layout-mode drag, slide-space px. */
  dropIndicator: { x: number; y: number; w: number; h: number } | null;
  hoveredEl: HTMLElement | null;
  /** Element hosting the active contenteditable text session. */
  sessionEl: HTMLElement | null;
  /** <pre> element open in the code editor modal. */
  codeEditEl: HTMLElement | null;
  /** Chart figure open in the chart editor modal. */
  chartEditEl: HTMLElement | null;
  /** <img> being reframed in crop mode (overlay crop gesture active). */
  cropEl: HTMLElement | null;
  /** <img> whose mask is being edited visually (overlay mask handles active). */
  maskEl: HTMLElement | null;
  /** Active right-panel tab; controlled so the stage can switch it. */
  rightTab: 'design' | 'layers' | 'image' | 'effects' | 'table';
  /** Rectangular cell selection within the selected table (grid coords), or
   *  null → the single active cell. Cleared on any element-selection change. */
  cellSel: CellRect | null;
  /** Active snap guide lines during a drag, in slide-space px. */
  snapGuides: { x: number | null; y: number | null } | null;
  /** Anchor dots shown during a connector-endpoint drag: the hovered
   *  element's 8 anchors, plus which one (if any) the endpoint snapped to. */
  anchorDots: { points: { x: number; y: number }[]; active: { x: number; y: number } | null } | null;
  /** The primary selection's rect DURING a drag, in slide-space px — the
   *  exact values just written. The overlay prefers this over measuring:
   *  parent-side getBoundingClientRect on iframe content lags one layout
   *  behind during rapid mutation. */
  dragRect: { left: number; top: number; width: number; height: number } | null;
  /** Fragment preview step (null = editor default, all visible). */
  fragmentStep: number | null;
  /** Design-system component palette modal. */
  paletteOpen: boolean;
  /** Icon library modal (inline-SVG inserts). */
  iconPickerOpen: boolean;
  /** Armed shape kind: the next canvas click/drag DRAWS this shape. */
  pendingShapeKind: ShapeKind | null;
  /** Right-click context menu position in slide-space px (null = closed). */
  contextMenu: { x: number; y: number } | null;
  /** Bumped on every DOM mutation / selection change → overlay re-measures. */
  docVersion: number;

  /** Provided by the mounted StageFrame; lets panels start text sessions. */
  startSession: (el: HTMLElement) => void;
  /** Provided by the mounted StageFrame; ends the active session (commit). */
  endSession: (commitFirst: boolean) => void;

  setCtx(ctx: StageCtx | null): void;
  setStartSession(fn: (el: HTMLElement) => void): void;
  setEndSession(fn: (commitFirst: boolean) => void): void;
  select(el: HTMLElement | null): void;
  /** Shift-click toggle: adds to / removes from the selection set. */
  toggleSelect(el: HTMLElement): void;
  /** Replace the whole selection set (marquee). */
  selectMany(els: HTMLElement[]): void;
  setMarquee(rect: { x: number; y: number; w: number; h: number } | null): void;
  setDrawLine(
    line: { kind: ShapeKind; x1: number; y1: number; x2: number; y2: number } | null,
  ): void;
  setLayoutMode(on: boolean): void;
  setDropIndicator(rect: { x: number; y: number; w: number; h: number } | null): void;
  hover(el: HTMLElement | null): void;
  setSessionEl(el: HTMLElement | null): void;
  setCodeEditEl(el: HTMLElement | null): void;
  setChartEditEl(el: HTMLElement | null): void;
  setCropEl(el: HTMLElement | null): void;
  setMaskEl(el: HTMLElement | null): void;
  setRightTab(tab: 'design' | 'layers' | 'image' | 'effects' | 'table'): void;
  setCellSel(rect: CellRect | null): void;
  setSnapGuides(g: { x: number | null; y: number | null } | null): void;
  setAnchorDots(
    d: { points: { x: number; y: number }[]; active: { x: number; y: number } | null } | null,
  ): void;
  setDragRect(r: { left: number; top: number; width: number; height: number } | null): void;
  setFragmentStep(step: number | null): void;
  setPaletteOpen(open: boolean): void;
  setIconPickerOpen(open: boolean): void;
  setPendingShapeKind(kind: ShapeKind | null): void;
  setContextMenu(pos: { x: number; y: number } | null): void;
  bump(): void;
  /** Stage rebuilt — all element refs are stale. */
  reset(): void;
}

export const useEditorStore = create<EditorState>()((set) => ({
  ctx: null,
  selectedEl: null,
  extraSelected: [],
  marquee: null,
  drawLine: null,
  layoutMode: false,
  dropIndicator: null,
  hoveredEl: null,
  sessionEl: null,
  codeEditEl: null,
  chartEditEl: null,
  cropEl: null,
  maskEl: null,
  rightTab: 'design',
  cellSel: null,
  snapGuides: null,
  anchorDots: null,
  dragRect: null,
  fragmentStep: null,
  paletteOpen: false,
  iconPickerOpen: false,
  pendingShapeKind: null,
  contextMenu: null,
  docVersion: 0,

  startSession: () => undefined,
  endSession: () => undefined,

  setCtx: (ctx) => set({ ctx }),
  setStartSession: (fn) => set({ startSession: fn }),
  setEndSession: (fn) => set({ endSession: fn }),
  select: (el) =>
    set((s) => ({ selectedEl: el, extraSelected: [], cellSel: null, docVersion: s.docVersion + 1 })),
  toggleSelect: (el) =>
    set((s) => {
      const all = [s.selectedEl, ...s.extraSelected].filter(
        (e): e is HTMLElement => !!e && e.isConnected,
      );
      const next = all.includes(el) ? all.filter((e) => e !== el) : [...all, el];
      return {
        selectedEl: next[next.length - 1] ?? null,
        extraSelected: next.slice(0, -1),
        cellSel: null,
        docVersion: s.docVersion + 1,
      };
    }),
  selectMany: (els) =>
    set((s) => ({
      selectedEl: els[els.length - 1] ?? null,
      extraSelected: els.slice(0, -1),
      cellSel: null,
      docVersion: s.docVersion + 1,
    })),
  setCellSel: (rect) => set((s) => ({ cellSel: rect, docVersion: s.docVersion + 1 })),
  setMarquee: (rect) => set((s) => ({ marquee: rect, docVersion: s.docVersion + 1 })),
  setDrawLine: (line) => set((s) => ({ drawLine: line, docVersion: s.docVersion + 1 })),
  setLayoutMode: (on) => set((s) => ({ layoutMode: on, docVersion: s.docVersion + 1 })),
  setDropIndicator: (rect) => set((s) => ({ dropIndicator: rect, docVersion: s.docVersion + 1 })),
  hover: (el) => set((s) => (s.hoveredEl === el ? s : { hoveredEl: el, docVersion: s.docVersion + 1 })),
  setSessionEl: (el) => set((s) => ({ sessionEl: el, docVersion: s.docVersion + 1 })),
  setCodeEditEl: (el) => set((s) => ({ codeEditEl: el, docVersion: s.docVersion + 1 })),
  setChartEditEl: (el) => set((s) => ({ chartEditEl: el, docVersion: s.docVersion + 1 })),
  setCropEl: (el) => set((s) => ({ cropEl: el, docVersion: s.docVersion + 1 })),
  setMaskEl: (el) => set((s) => ({ maskEl: el, docVersion: s.docVersion + 1 })),
  setRightTab: (tab) => set((s) => ({ rightTab: tab, docVersion: s.docVersion + 1 })),
  setSnapGuides: (g) => set((s) => ({ snapGuides: g, docVersion: s.docVersion + 1 })),
  setAnchorDots: (d) => set((s) => ({ anchorDots: d, docVersion: s.docVersion + 1 })),
  setDragRect: (r) => set((s) => ({ dragRect: r, docVersion: s.docVersion + 1 })),
  setFragmentStep: (step) => set((s) => ({ fragmentStep: step, docVersion: s.docVersion + 1 })),
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  setIconPickerOpen: (open) => set({ iconPickerOpen: open }),
  setPendingShapeKind: (kind) => set((s) => ({ pendingShapeKind: kind, docVersion: s.docVersion + 1 })),
  setContextMenu: (pos) => set((s) => ({ contextMenu: pos, docVersion: s.docVersion + 1 })),
  bump: () => set((s) => ({ docVersion: s.docVersion + 1 })),
  reset: () =>
    set((s) => ({
      selectedEl: null,
      extraSelected: [],
      marquee: null,
      drawLine: null,
      dropIndicator: null, // layoutMode itself persists across slides
      hoveredEl: null,
      sessionEl: null,
      codeEditEl: null,
      chartEditEl: null,
      cropEl: null,
      maskEl: null,
      cellSel: null,
      snapGuides: null,
      anchorDots: null,
      dragRect: null,
      fragmentStep: null,
      contextMenu: null,
      docVersion: s.docVersion + 1,
    })),
}));
