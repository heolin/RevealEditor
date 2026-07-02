import { allActions } from './index';
import { buildEditorContext } from './context';
import type { Action } from './types';

function matches(shortcut: string, e: KeyboardEvent): boolean {
  const parts = shortcut.toLowerCase().split('+');
  const key = parts[parts.length - 1];
  const needMod = parts.includes('mod');
  const needShift = parts.includes('shift');
  const hasMod = e.ctrlKey || e.metaKey;
  if (needMod !== hasMod) return false;
  if (needShift !== e.shiftKey) return false;
  return e.key.toLowerCase() === key;
}

/**
 * One keyboard dispatcher for all surfaces. Returns true when an action
 * handled the event (caller preventDefaults). During text sessions only
 * `worksInSession` actions fire — everything else belongs to the browser's
 * native editing.
 */
export function dispatchShortcut(e: KeyboardEvent, inSession: boolean): Action | null {
  const ctx = buildEditorContext();
  for (const action of allActions()) {
    if (!action.shortcut) continue;
    if (inSession && !action.worksInSession) continue;
    const shortcuts = Array.isArray(action.shortcut) ? action.shortcut : [action.shortcut];
    if (!shortcuts.some((s) => matches(s, e))) continue;
    if (!action.when(ctx) || !(action.enabled?.(ctx) ?? true)) continue;
    action.run(ctx);
    return action;
  }
  return null;
}
