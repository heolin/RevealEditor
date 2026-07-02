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
  selectedEl: HTMLElement | null;
  hoveredEl: HTMLElement | null;
  /** Element hosting the active contenteditable text session. */
  sessionEl: HTMLElement | null;
  /** <pre> element open in the code editor modal. */
  codeEditEl: HTMLElement | null;
  /** Bumped on every DOM mutation / selection change → overlay re-measures. */
  docVersion: number;

  /** Provided by the mounted StageFrame; lets panels start text sessions. */
  startSession: (el: HTMLElement) => void;

  setCtx(ctx: StageCtx | null): void;
  setStartSession(fn: (el: HTMLElement) => void): void;
  select(el: HTMLElement | null): void;
  hover(el: HTMLElement | null): void;
  setSessionEl(el: HTMLElement | null): void;
  setCodeEditEl(el: HTMLElement | null): void;
  bump(): void;
  /** Stage rebuilt — all element refs are stale. */
  reset(): void;
}

export const useEditorStore = create<EditorState>()((set) => ({
  ctx: null,
  selectedEl: null,
  hoveredEl: null,
  sessionEl: null,
  codeEditEl: null,
  docVersion: 0,

  startSession: () => undefined,

  setCtx: (ctx) => set({ ctx }),
  setStartSession: (fn) => set({ startSession: fn }),
  select: (el) => set((s) => ({ selectedEl: el, docVersion: s.docVersion + 1 })),
  hover: (el) => set((s) => (s.hoveredEl === el ? s : { hoveredEl: el, docVersion: s.docVersion + 1 })),
  setSessionEl: (el) => set((s) => ({ sessionEl: el, docVersion: s.docVersion + 1 })),
  setCodeEditEl: (el) => set((s) => ({ codeEditEl: el, docVersion: s.docVersion + 1 })),
  bump: () => set((s) => ({ docVersion: s.docVersion + 1 })),
  reset: () =>
    set((s) => ({
      selectedEl: null,
      hoveredEl: null,
      sessionEl: null,
      codeEditEl: null,
      docVersion: s.docVersion + 1,
    })),
}));
