import type { Action, EditorContext, SurfaceLayout } from './types';
import { formatActions } from './format';
import { insertActions } from './insert';
import { arrangeActions, historyActions } from './arrange';
import { contentActions } from './content';

const ALL: Action[] = [
  ...formatActions,
  ...insertActions,
  ...arrangeActions,
  ...historyActions,
  ...contentActions,
];
const BY_ID = new Map(ALL.map((a) => [a.id, a]));

const warned = new Set<string>();

export function getAction(id: string): Action | null {
  const action = BY_ID.get(id) ?? null;
  if (!action && !warned.has(id)) {
    warned.add(id);
    console.warn(`[revealeditor] unknown action id in layout: ${id}`);
  }
  return action;
}

export function allActions(): Action[] {
  return ALL;
}

/** Resolve a layout to visible action groups for a context (empty groups dropped). */
export function resolveLayout(layout: SurfaceLayout, ctx: EditorContext): Action[][] {
  return layout
    .map((group) =>
      group
        .map(getAction)
        .filter((a): a is Action => !!a && a.when(ctx)),
    )
    .filter((group) => group.length > 0);
}

export function isEnabled(action: Action, ctx: EditorContext): boolean {
  return action.when(ctx) && (action.enabled?.(ctx) ?? true);
}

export * from './types';
export { buildEditorContext, useEditorContext } from './context';
