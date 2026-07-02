import {
  IconBlockquote,
  IconChartBar,
  IconCircle,
  IconCode,
  IconComponents,
  IconHeading,
  IconLetterT,
  IconLine,
  IconList,
  IconArrowUpRight,
  IconRectangle,
  IconTable,
} from '@tabler/icons-react';
import type { Action, EditorContext } from './types';
import { insertHtmlSnippet } from '../commands';
import { insertTable } from '../table';
import { insertShape, type ShapeKind } from '../shapes';
import { insertChart } from '../chart/chart';
import { useEditorStore } from '../editorStore';
import { ImageInsertControl } from './customControls';

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

const SHAPE_ICONS: Record<ShapeKind, Action['icon']> = {
  rect: IconRectangle,
  ellipse: IconCircle,
  line: IconLine,
  arrow: IconArrowUpRight,
};

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
  ...(Object.keys(SHAPE_ICONS) as ShapeKind[]).map(
    (kind): Action => ({
      id: `insert.shape.${kind}`,
      title: `${kind[0].toUpperCase()}${kind.slice(1)}`,
      icon: SHAPE_ICONS[kind],
      kind: 'button',
      group: 'insert',
      when: canInsert,
      run: (ctx) => ctx.stage && insertShape(ctx.stage, kind),
    }),
  ),
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
