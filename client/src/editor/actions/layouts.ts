/**
 * Default surface layouts — arrays of action ids, inner arrays are groups
 * rendered with separators. Overridable via `.revealeditor.json` in the
 * workspace root (see docs/TOOLBARS.md P4): unknown ids warn and are skipped,
 * so configs degrade gracefully across versions.
 */
import type { SurfaceLayout } from './types';

/** Top panel: stable ribbon-lite; unavailable actions render disabled. */
export const TOP_LAYOUT: SurfaceLayout = [
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
];

/** Floating toolbar: the quick subset that follows the selection. */
export const FLOATING_LAYOUT: SurfaceLayout = [
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
  ['arrange.front', 'arrange.back', 'arrange.unpin'],
  ['arrange.duplicate', 'arrange.delete'],
];

/** Insert menu (toolbar "+" and, later, the right-click context menu). */
export const INSERT_MENU_LAYOUT: SurfaceLayout = [
  ['insert.heading', 'insert.text', 'insert.bulletList', 'insert.quote'],
  ['insert.image', 'insert.code', 'insert.table', 'insert.chart', 'insert.component'],
  ['insert.shape.rect', 'insert.shape.ellipse', 'insert.shape.line', 'insert.shape.arrow'],
];
