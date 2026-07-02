/**
 * Surface layouts — arrays of action ids, inner arrays are groups rendered
 * with separators. Defaults live here; a `.revealeditor.json` in the
 * workspace root may override any surface (docs/TOOLBARS.md P4):
 *
 *   { "toolbars": { "top": [["history.undo"], …], "floating": […],
 *                   "insertMenu": […], "context": […] } }
 *
 * Unknown action ids warn and are skipped, so configs degrade gracefully.
 */
import type { SurfaceLayout } from './types';

export type SurfaceId = 'top' | 'floating' | 'insertMenu' | 'context';

const DEFAULTS: Record<SurfaceId, SurfaceLayout> = {
  /** Top panel: stable ribbon-lite; unavailable actions render disabled. */
  top: [
    ['history.undo', 'history.redo'],
    [
      'insert.heading',
      'insert.text',
      'insert.bulletList',
      'insert.image',
      'insert.code',
      'insert.table',
      'insert.chart',
      'insert.shape.rect',
      'insert.component',
    ],
    ['format.heading', 'format.fontFamily', 'format.fontSize', 'format.textColor'],
    ['format.bold', 'format.italic', 'format.align.left', 'format.align.center', 'format.align.right'],
    ['arrange.front', 'arrange.back', 'arrange.unpin'],
  ],

  /** Floating toolbar: the quick subset that follows the selection. */
  floating: [
    ['format.heading'],
    [
      'format.bold',
      'format.italic',
      'format.strike',
      'format.link',
      'format.bulletList',
      'format.numberedList',
    ],
    ['format.align.left', 'format.align.center', 'format.align.right'],
    ['code.edit', 'chart.edit'],
    ['arrange.front', 'arrange.back', 'arrange.unpin'],
    ['arrange.duplicate', 'arrange.delete'],
  ],

  /** Insert "+" menu. */
  insertMenu: [
    ['insert.heading', 'insert.text', 'insert.bulletList', 'insert.quote'],
    ['insert.image', 'insert.code', 'insert.table', 'insert.chart', 'insert.component'],
    ['insert.shape.rect', 'insert.shape.ellipse', 'insert.shape.line', 'insert.shape.arrow'],
  ],

  /** Right-click context menu — unavailable actions hidden (menu convention). */
  context: [
    ['code.edit', 'chart.edit'],
    [
      'table.rowAbove',
      'table.rowBelow',
      'table.colLeft',
      'table.colRight',
      'table.deleteRow',
      'table.deleteCol',
    ],
    ['arrange.duplicate', 'arrange.copy', 'arrange.cut', 'arrange.paste'],
    ['arrange.front', 'arrange.back', 'arrange.unpin'],
    // insert.image is deliberately absent: its file input would unmount when
    // the menu closes, dropping the picker callback.
    ['insert.heading', 'insert.text', 'insert.bulletList', 'insert.code', 'insert.table', 'insert.chart', 'insert.component'],
    ['arrange.delete'],
  ],
};

const current: Record<SurfaceId, SurfaceLayout> = { ...DEFAULTS };

export function getLayout(surface: SurfaceId): SurfaceLayout {
  return current[surface];
}

/** Merge overrides from .revealeditor.json; invalid shapes are ignored. */
export function applyLayoutOverrides(overrides: unknown): void {
  if (!overrides || typeof overrides !== 'object') return;
  const toolbars = (overrides as { toolbars?: unknown }).toolbars;
  if (!toolbars || typeof toolbars !== 'object') return;
  for (const surface of Object.keys(DEFAULTS) as SurfaceId[]) {
    const layout = (toolbars as Record<string, unknown>)[surface];
    if (
      Array.isArray(layout) &&
      layout.every((g) => Array.isArray(g) && g.every((id) => typeof id === 'string'))
    ) {
      current[surface] = layout as SurfaceLayout;
    }
  }
}

/** Test hook. */
export function resetLayouts(): void {
  for (const s of Object.keys(DEFAULTS) as SurfaceId[]) current[s] = DEFAULTS[s];
}
