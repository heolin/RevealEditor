/**
 * Content-type quick actions (context-menu fodder): table row/column ops,
 * chart & code editors. Verbose property forms stay in the Inspector.
 */
import {
  IconArrowMergeAltRight,
  IconArrowsSplit2,
  IconChartBar,
  IconCode,
  IconColumnInsertLeft,
  IconColumnInsertRight,
  IconColumnRemove,
  IconRowInsertBottom,
  IconRowInsertTop,
  IconRowRemove,
} from '@tabler/icons-react';
import type { Action, EditorContext } from './types';
import {
  addColumn,
  addRow,
  canMerge,
  canSplit,
  deleteColumn,
  deleteRow,
  mergeCells,
  splitCell,
} from '../table';
import { tableToChart } from '../chart/chart';
import { useEditorStore } from '../editorStore';

const inCell = (ctx: EditorContext) => !!ctx.stage && !!ctx.cell && ctx.session !== 'code';

function tableAction(
  id: string,
  title: string,
  icon: Action['icon'],
  run: (ctx: EditorContext) => void,
): Action {
  return { id, title, icon, kind: 'button', group: 'table', when: inCell, run };
}

export const contentActions: Action[] = [
  tableAction('table.rowAbove', 'Add row above', IconRowInsertTop, (ctx) =>
    addRow(ctx.stage!, ctx.cell!, 'above'),
  ),
  tableAction('table.rowBelow', 'Add row below', IconRowInsertBottom, (ctx) =>
    addRow(ctx.stage!, ctx.cell!, 'below'),
  ),
  tableAction('table.colLeft', 'Add column left', IconColumnInsertLeft, (ctx) =>
    addColumn(ctx.stage!, ctx.cell!, 'left'),
  ),
  tableAction('table.colRight', 'Add column right', IconColumnInsertRight, (ctx) =>
    addColumn(ctx.stage!, ctx.cell!, 'right'),
  ),
  tableAction('table.deleteRow', 'Delete row', IconRowRemove, (ctx) =>
    deleteRow(ctx.stage!, ctx.cell!),
  ),
  tableAction('table.deleteCol', 'Delete column', IconColumnRemove, (ctx) =>
    deleteColumn(ctx.stage!, ctx.cell!),
  ),
  {
    ...tableAction('table.mergeRight', 'Merge with right cell', IconArrowMergeAltRight, (ctx) =>
      mergeCells(ctx.stage!, ctx.cell!, 'right'),
    ),
    when: (ctx) => inCell(ctx) && canMerge(ctx.cell!, 'right'),
  },
  {
    ...tableAction('table.mergeDown', 'Merge with cell below', IconArrowMergeAltRight, (ctx) =>
      mergeCells(ctx.stage!, ctx.cell!, 'down'),
    ),
    when: (ctx) => inCell(ctx) && canMerge(ctx.cell!, 'down'),
  },
  {
    ...tableAction('table.splitCell', 'Split cell', IconArrowsSplit2, (ctx) =>
      splitCell(ctx.stage!, ctx.cell!),
    ),
    when: (ctx) => inCell(ctx) && canSplit(ctx.cell!),
  },
  {
    id: 'table.toChart',
    title: 'Convert to chart',
    icon: IconChartBar,
    kind: 'button',
    group: 'table',
    when: inCell,
    run: (ctx) => {
      const table = ctx.cell?.closest('table');
      if (!ctx.stage || !table) return;
      const fig = tableToChart(ctx.stage, table as HTMLTableElement);
      if (fig) useEditorStore.getState().select(fig);
    },
  },
  {
    id: 'chart.edit',
    title: 'Edit chart data…',
    icon: IconChartBar,
    kind: 'button',
    group: 'format',
    when: (ctx) => ctx.handler?.type === 'chart' && !!ctx.selection,
    run: (ctx) => ctx.selection && useEditorStore.getState().setChartEditEl(ctx.selection),
  },
  {
    id: 'code.edit',
    title: 'Edit code…',
    icon: IconCode,
    kind: 'button',
    group: 'format',
    when: (ctx) => ctx.handler?.type === 'code' && !!ctx.selection,
    run: (ctx) => ctx.selection && useEditorStore.getState().setCodeEditEl(ctx.selection),
  },
];
