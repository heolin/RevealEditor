/**
 * The command system (docs/TOOLBARS.md): every editor command is an Action —
 * data, not UI. Surfaces (top panel, floating toolbar, context menu,
 * keyboard) render the same registry through layout configs.
 */
import type { ComponentType } from 'react';
import type { StageCtx } from '../commands';
import type { ElementHandler } from '../registry';
import type { Slide } from '../../model/deck';
import type { DeckMeta } from '../../state/deckStore';

/** One computed truth about "what is the user on" — see docs/TOOLBARS.md. */
export interface EditorContext {
  stage: StageCtx | null;
  /** Primary selection (last clicked). */
  selection: HTMLElement | null;
  /** Full selection set: [.., primary last]; empty when nothing selected. */
  selections: HTMLElement[];
  handler: ElementHandler | null;
  session: 'text' | 'code' | 'chart' | null;
  isAbsolute: boolean;
  cell: HTMLTableCellElement | null;
  slide: Slide | null;
  deck: DeckMeta | null;
}

export type ActionKind = 'button' | 'toggle' | 'select' | 'color' | 'number' | 'custom';
export type ActionGroup =
  | 'file'
  | 'history'
  | 'insert'
  | 'format'
  | 'arrange'
  | 'table'
  | 'slide'
  | 'view';

export interface ActionOption {
  value: string;
  label: string;
}

export interface Action {
  id: string;
  title: string;
  icon?: ComponentType<{ size?: number | string }>;
  kind: ActionKind;
  group: ActionGroup;

  when(ctx: EditorContext): boolean;
  enabled?(ctx: EditorContext): boolean;
  active?(ctx: EditorContext): boolean;
  value?(ctx: EditorContext): string | null;
  options?(ctx: EditorContext): ActionOption[];

  run(ctx: EditorContext, value?: string): void;
  /** e.g. 'mod+b', 'mod+shift+z', 'delete' — resolved by the dispatcher. */
  shortcut?: string | string[];
  /** Shortcut also fires while a text session is active. */
  worksInSession?: boolean;
  /** Widget width hint for select/color kinds on toolbar surfaces. */
  width?: number;
  /** Escape hatch for bespoke widgets (link popover, file inputs). */
  render?: ComponentType<{ ctx: EditorContext; variant: SurfaceVariant }>;
}

export type SurfaceVariant = 'toolbar' | 'menu';

/** Layout = groups of action ids; groups render with separators. */
export type SurfaceLayout = string[][];
