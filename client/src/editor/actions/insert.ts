import {
  IconBlockquote,
  IconChartBar,
  IconCode,
  IconIcons,
  IconColumns2,
  IconColumns3,
  IconComponents,
  IconHeading,
  IconLetterT,
  IconList,
  IconSquare,
  IconTable,
} from '@tabler/icons-react';
import type { Action, EditorContext } from './types';
import { insertHtmlSnippet } from '../commands';
import { ensureManagedBlock } from '../managedCss';
import { insertTable } from '../table';
import { SHAPE_KINDS } from '../shapes';
import { insertChart } from '../chart/chart';
import { useEditorStore } from '../editorStore';
import { ImageInsertControl, SHAPE_META, ShapeMenuControl } from './customControls';

const canInsert = (ctx: EditorContext) => !!ctx.stage && !!ctx.slide && ctx.session !== 'text';

function snippetAction(
  id: string,
  title: string,
  icon: Action['icon'],
  html: string,
): Action {
  return {
    id,
    title,
    icon,
    kind: 'button',
    group: 'insert',
    when: canInsert,
    run: (ctx) => ctx.stage && insertHtmlSnippet(ctx.stage, html, ctx.selection),
  };
}

const LAYOUT_CSS_MARKER = '/* re:layout */';
const LAYOUT_CSS = `.re-cols { display: flex; gap: 24px; width: 100%; align-items: stretch; }
.re-col { flex: 1 1 0; min-width: 0; }
.re-cell { width: 100%; }`;

function columnsAction(count: 2 | 3): Action {
  return {
    id: `insert.columns${count}`,
    title: `${count === 2 ? 'Two' : 'Three'} columns`,
    icon: count === 2 ? IconColumns2 : IconColumns3,
    kind: 'button',
    group: 'insert',
    when: canInsert,
    run: (ctx) => {
      if (!ctx.stage) return;
      ensureManagedBlock(LAYOUT_CSS_MARKER, LAYOUT_CSS);
      const cols = Array.from({ length: count }, () => '  <div class="re-col"></div>').join('\n');
      insertHtmlSnippet(ctx.stage, `<div class="re-cols">\n${cols}\n</div>`, ctx.selection);
    },
  };
}

const cellAction: Action = {
  id: 'insert.cell',
  title: 'Single cell',
  icon: IconSquare,
  kind: 'button',
  group: 'insert',
  when: canInsert,
  run: (ctx) => {
    if (!ctx.stage) return;
    ensureManagedBlock(LAYOUT_CSS_MARKER, LAYOUT_CSS);
    insertHtmlSnippet(ctx.stage, '<div class="re-cell"></div>', ctx.selection);
  },
};

// Kind → icon/title lives in SHAPE_META (customControls.tsx) — shared with
// the ribbon's flowchart-shapes dropdown.

export const insertActions: Action[] = [
  snippetAction('insert.heading', 'Heading', IconHeading, '<h2>Heading</h2>'),
  snippetAction('insert.text', 'Text', IconLetterT, '<p>Text</p>'),
  snippetAction(
    'insert.bulletList',
    'Bullet list',
    IconList,
    '<ul>\n  <li>First item</li>\n  <li>Second item</li>\n</ul>',
  ),
  snippetAction('insert.quote', 'Quote', IconBlockquote, '<blockquote>Quote</blockquote>'),
  cellAction,
  columnsAction(2),
  columnsAction(3),
  {
    id: 'insert.image',
    title: 'Image…',
    kind: 'custom',
    group: 'insert',
    when: canInsert,
    run: () => undefined, // custom control owns the file picker
    render: ImageInsertControl,
  },
  {
    id: 'insert.code',
    title: 'Code block',
    icon: IconCode,
    kind: 'button',
    group: 'insert',
    when: canInsert,
    run: (ctx) => {
      if (!ctx.stage) return;
      const el = insertHtmlSnippet(
        ctx.stage,
        '<pre><code class="language-javascript" data-trim>\nconst answer = 42;\n</code></pre>',
        ctx.selection,
      );
      if (el) useEditorStore.getState().setCodeEditEl(el);
    },
  },
  {
    id: 'insert.table',
    title: 'Table',
    icon: IconTable,
    kind: 'button',
    group: 'insert',
    when: canInsert,
    run: (ctx) => ctx.stage && insertTable(ctx.stage, ctx.selection),
  },
  {
    id: 'insert.chart',
    title: 'Chart…',
    icon: IconChartBar,
    kind: 'button',
    group: 'insert',
    when: canInsert,
    run: (ctx) => {
      if (!ctx.stage) return;
      const el = insertChart(ctx.stage, ctx.selection);
      if (el) useEditorStore.getState().setChartEditEl(el);
    },
  },
  ...SHAPE_KINDS.map(
    (kind): Action => ({
      id: `insert.shape.${kind}`,
      title: SHAPE_META[kind].title,
      icon: SHAPE_META[kind].icon,
      kind: 'button',
      group: 'insert',
      when: canInsert,
      // Arms draw mode: the next canvas click places the default size at
      // that point; a drag draws the shape at the dragged rect (Esc cancels).
      run: () => useEditorStore.getState().setPendingShapeKind(kind),
    }),
  ),
  {
    id: 'insert.shapes',
    title: 'Shapes',
    kind: 'custom',
    group: 'insert',
    when: canInsert,
    run: () => undefined, // the gallery owns the kind choice
    render: ShapeMenuControl,
  },
  {
    id: 'insert.icon',
    title: 'Icon…',
    icon: IconIcons,
    kind: 'button',
    group: 'insert',
    when: canInsert,
    run: () => useEditorStore.getState().setIconPickerOpen(true),
  },
  {
    id: 'insert.component',
    title: 'Component…',
    icon: IconComponents,
    kind: 'button',
    group: 'insert',
    when: canInsert,
    run: () => useEditorStore.getState().setPaletteOpen(true),
  },
];
