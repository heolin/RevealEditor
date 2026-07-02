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

interface EditorState {
  /** Live stage context for commands/toolbars; null when no stage mounted. */
  ctx: StageCtx | null;
  /** Primary selection (last clicked) — single-selection consumers use this. */
  selectedEl: HTMLElement | null;
  /** Additional selected elements (shift-click / marquee). */
  extraSelected: HTMLElement[];
  /** Marquee rectangle during rubber-band selection, slide-space px. */
  marquee: { x: number; y: number; w: number; h: number } | null;
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
  /** Active snap guide lines during a drag, in slide-space px. */
  snapGuides: { x: number | null; y: number | null } | null;
  /** Fragment preview step (null = editor default, all visible). */
  fragmentStep: number | null;
  /** Design-system component palette modal. */
  paletteOpen: boolean;
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
  setLayoutMode(on: boolean): void;
  setDropIndicator(rect: { x: number; y: number; w: number; h: number } | null): void;
  hover(el: HTMLElement | null): void;
  setSessionEl(el: HTMLElement | null): void;
  setCodeEditEl(el: HTMLElement | null): void;
  setChartEditEl(el: HTMLElement | null): void;
  setSnapGuides(g: { x: number | null; y: number | null } | null): void;
  setFragmentStep(step: number | null): void;
  setPaletteOpen(open: boolean): void;
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
  layoutMode: false,
  dropIndicator: null,
  hoveredEl: null,
  sessionEl: null,
  codeEditEl: null,
  chartEditEl: null,
  snapGuides: null,
  fragmentStep: null,
  paletteOpen: false,
  contextMenu: null,
  docVersion: 0,

  startSession: () => undefined,
  endSession: () => undefined,

  setCtx: (ctx) => set({ ctx }),
  setStartSession: (fn) => set({ startSession: fn }),
  setEndSession: (fn) => set({ endSession: fn }),
  select: (el) =>
    set((s) => ({ selectedEl: el, extraSelected: [], docVersion: s.docVersion + 1 })),
  toggleSelect: (el) =>
    set((s) => {
      const all = [s.selectedEl, ...s.extraSelected].filter(
        (e): e is HTMLElement => !!e && e.isConnected,
      );
      const next = all.includes(el) ? all.filter((e) => e !== el) : [...all, el];
      return {
        selectedEl: next[next.length - 1] ?? null,
        extraSelected: next.slice(0, -1),
        docVersion: s.docVersion + 1,
      };
    }),
  selectMany: (els) =>
    set((s) => ({
      selectedEl: els[els.length - 1] ?? null,
      extraSelected: els.slice(0, -1),
      docVersion: s.docVersion + 1,
    })),
  setMarquee: (rect) => set((s) => ({ marquee: rect, docVersion: s.docVersion + 1 })),
  setLayoutMode: (on) => set((s) => ({ layoutMode: on, docVersion: s.docVersion + 1 })),
  setDropIndicator: (rect) => set((s) => ({ dropIndicator: rect, docVersion: s.docVersion + 1 })),
  hover: (el) => set((s) => (s.hoveredEl === el ? s : { hoveredEl: el, docVersion: s.docVersion + 1 })),
  setSessionEl: (el) => set((s) => ({ sessionEl: el, docVersion: s.docVersion + 1 })),
  setCodeEditEl: (el) => set((s) => ({ codeEditEl: el, docVersion: s.docVersion + 1 })),
  setChartEditEl: (el) => set((s) => ({ chartEditEl: el, docVersion: s.docVersion + 1 })),
  setSnapGuides: (g) => set((s) => ({ snapGuides: g, docVersion: s.docVersion + 1 })),
  setFragmentStep: (step) => set((s) => ({ fragmentStep: step, docVersion: s.docVersion + 1 })),
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  setContextMenu: (pos) => set((s) => ({ contextMenu: pos, docVersion: s.docVersion + 1 })),
  bump: () => set((s) => ({ docVersion: s.docVersion + 1 })),
  reset: () =>
    set((s) => ({
      selectedEl: null,
      extraSelected: [],
      marquee: null,
      dropIndicator: null, // layoutMode itself persists across slides
      hoveredEl: null,
      sessionEl: null,
      codeEditEl: null,
      chartEditEl: null,
      snapGuides: null,
      fragmentStep: null,
      contextMenu: null,
      docVersion: s.docVersion + 1,
    })),
}));
