/**
 * The "Table" tab (shown while the selection is inside a table). Select a
 * scope — the active Cell, its Row, its Column, or the whole Table — then apply
 * fill / text color / bold / italic / alignment / size / border to every cell
 * in that scope. Styles are written as inline styles on the <td>/<th> (they
 * round-trip verbatim). Structure ops (preset, header, add/delete, merge/split)
 * live here too.
 */
import {
  Button,
  Divider,
  Group,
  Select,
  Stack,
  Switch,
  Text,
} from '@mantine/core';
import {
  IconAlignCenter,
  IconAlignLeft,
  IconAlignRight,
  IconBold,
  IconItalic,
  IconLayoutAlignBottom,
  IconLayoutAlignMiddle,
  IconLayoutAlignTop,
} from '@tabler/icons-react';
import { useEditorStore } from '../../editor/editorStore';
import { ReColorInput, BorderWidthPicker, LineStylePicker } from '../pickers';
import {
  TABLE_PRESETS,
  addColumn,
  addRow,
  allRect,
  applyCellStyle,
  canMerge,
  canSplit,
  colRect,
  deleteColumn,
  deleteRow,
  gridCoordOf,
  gridSize,
  hasHeaderRow,
  mergeCells,
  rowRect,
  selectedCells,
  setTablePreset,
  splitCell,
  tablePreset,
  toggleCellStyle,
  toggleHeaderRow,
  type CellRect,
  type TablePreset,
} from '../../editor/table';

const FONT_SIZES = ['', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '40px'];
type Scope = 'cell' | 'row' | 'column' | 'table' | 'cells';

function scopeOf(table: HTMLTableElement, rect: CellRect | null): Scope {
  if (!rect) return 'cell';
  const { rows, cols } = gridSize(table);
  if (rect.r0 === 0 && rect.r1 === rows - 1 && rect.c0 === 0 && rect.c1 === cols - 1) return 'table';
  if (rect.r0 === rect.r1 && rect.c0 === 0 && rect.c1 === cols - 1) return 'row';
  if (rect.c0 === rect.c1 && rect.r0 === 0 && rect.r1 === rows - 1) return 'column';
  return 'cells';
}

export function TablePanel() {
  useEditorStore((s) => s.docVersion);
  const ctx = useEditorStore((s) => s.ctx);
  const sel = useEditorStore((s) => s.selectedEl);
  const cellSel = useEditorStore((s) => s.cellSel);
  const table = (sel?.closest('table') as HTMLTableElement | null) ?? null;

  if (!ctx || !table) {
    return (
      <Text size="sm" c="dimmed" p="sm">
        Select a table to edit it.
      </Text>
    );
  }

  const active = (sel?.closest('td, th') as HTMLTableCellElement | null) ?? null;
  const cells = selectedCells(table, cellSel, active);
  const rep = cells[0] ?? active; // representative for reading current values
  const scope = scopeOf(table, cellSel);
  const rc = active ? gridCoordOf(table, active) : null;

  const setScope = (s: Scope) => {
    if (!rc && s !== 'table') return;
    const store = useEditorStore.getState();
    if (s === 'cell') store.setCellSel(null);
    else if (s === 'row') store.setCellSel(rowRect(table, rc![0]));
    else if (s === 'column') store.setCellSel(colRect(table, rc![1]));
    else if (s === 'table') store.setCellSel(allRect(table));
  };

  const apply = (patch: Record<string, string | null>) => applyCellStyle(ctx, cells, patch);
  const isOn = (prop: string, val: string) =>
    cells.length > 0 && cells.every((c) => c.style.getPropertyValue(prop) === val);
  const borderW = parseInt(rep?.style.borderWidth || '0', 10) || 0;

  const scopeLabel: Record<Scope, string> = {
    cell: 'Cell',
    row: 'Row',
    column: 'Column',
    table: 'Table',
    cells: `${cells.length} cells`,
  };

  return (
    <Stack gap="sm" p="xs">
      <Text size="xs" fw={600} c="dimmed">
        SCOPE · {scopeLabel[scope]}
      </Text>
      <Button.Group>
        {(['cell', 'row', 'column', 'table'] as const).map((s) => (
          <Button
            key={s}
            size="compact-xs"
            variant={scope === s ? 'filled' : 'default'}
            disabled={!active && s !== 'table'}
            onClick={() => setScope(s)}
          >
            {s[0].toUpperCase() + s.slice(1)}
          </Button>
        ))}
      </Button.Group>

      <Group gap={6} wrap="nowrap">
        <ReColorInput
          key={`fill-${rep?.style.backgroundColor}`}
          label="Fill"
          defaultValue={rep?.style.backgroundColor}
          placeholder="none"
          onChangeEnd={(v) => apply({ 'background-color': v || null })}
        />
        <ReColorInput
          key={`col-${rep?.style.color}`}
          label="Text"
          defaultValue={rep?.style.color}
          placeholder="theme"
          onChangeEnd={(v) => apply({ color: v || null })}
        />
      </Group>

      <Group gap={4}>
        <Button
          size="compact-sm"
          variant={isOn('font-weight', 'bold') ? 'filled' : 'default'}
          onClick={() => toggleCellStyle(ctx, cells, 'font-weight', 'bold')}
          aria-label="Bold"
        >
          <IconBold size={15} />
        </Button>
        <Button
          size="compact-sm"
          variant={isOn('font-style', 'italic') ? 'filled' : 'default'}
          onClick={() => toggleCellStyle(ctx, cells, 'font-style', 'italic')}
          aria-label="Italic"
        >
          <IconItalic size={15} />
        </Button>
        <Divider orientation="vertical" />
        {(
          [
            ['left', IconAlignLeft],
            ['center', IconAlignCenter],
            ['right', IconAlignRight],
          ] as const
        ).map(([a, Icon]) => (
          <Button
            key={a}
            size="compact-sm"
            variant={isOn('text-align', a) ? 'filled' : 'default'}
            onClick={() => apply({ 'text-align': isOn('text-align', a) ? null : a })}
            aria-label={`Align ${a}`}
          >
            <Icon size={15} />
          </Button>
        ))}
        <Divider orientation="vertical" />
        {(
          [
            ['top', IconLayoutAlignTop],
            ['middle', IconLayoutAlignMiddle],
            ['bottom', IconLayoutAlignBottom],
          ] as const
        ).map(([v, Icon]) => (
          <Button
            key={v}
            size="compact-sm"
            variant={isOn('vertical-align', v) ? 'filled' : 'default'}
            onClick={() => apply({ 'vertical-align': isOn('vertical-align', v) ? null : v })}
            aria-label={`V-align ${v}`}
          >
            <Icon size={15} />
          </Button>
        ))}
      </Group>

      <Select
        label="Font size"
        size="xs"
        value={rep?.style.fontSize || ''}
        data={FONT_SIZES.map((s) => ({ value: s, label: s || 'default' }))}
        onChange={(v) => apply({ 'font-size': v || null })}
      />

      <Group gap={8} wrap="nowrap" align="flex-end">
        <BorderWidthPicker
          label="Border"
          value={borderW}
          allowNone
          onChange={(w) =>
            apply(
              w > 0
                ? {
                    'border-width': `${w}px`,
                    'border-style': rep?.style.borderStyle || 'solid',
                    'border-color': rep?.style.borderColor || 'currentColor',
                  }
                : { 'border-width': null, 'border-style': null, 'border-color': null },
            )
          }
        />
        <LineStylePicker
          label="Style"
          value={(rep?.style.borderStyle as 'solid' | 'dashed' | 'dotted') || 'solid'}
          onChange={(v) => borderW > 0 && apply({ 'border-style': v })}
        />
        <ReColorInput
          key={`bc-${rep?.style.borderColor}`}
          label="Color"
          defaultValue={rep?.style.borderColor}
          placeholder="text"
          disabled={borderW === 0}
          onChangeEnd={(v) => borderW > 0 && apply({ 'border-color': v || 'currentColor' })}
        />
      </Group>

      <Divider />
      <Text size="xs" fw={600} c="dimmed">
        STRUCTURE
      </Text>
      <Select
        label="Style"
        size="xs"
        value={tablePreset(table)}
        placeholder="theme default"
        clearable
        data={TABLE_PRESETS.map((p) => ({ value: p, label: p }))}
        onChange={(v) => setTablePreset(ctx, table, (v as TablePreset) ?? null)}
      />
      <Switch
        label="Header row"
        size="xs"
        checked={hasHeaderRow(table)}
        onChange={() => toggleHeaderRow(ctx, table)}
      />
      {active && (
        <>
          <Group gap={4}>
            <Button size="compact-xs" variant="default" onClick={() => addRow(ctx, active, 'above')}>
              + Row ↑
            </Button>
            <Button size="compact-xs" variant="default" onClick={() => addRow(ctx, active, 'below')}>
              + Row ↓
            </Button>
            <Button size="compact-xs" variant="default" onClick={() => addColumn(ctx, active, 'left')}>
              + Col ←
            </Button>
            <Button size="compact-xs" variant="default" onClick={() => addColumn(ctx, active, 'right')}>
              + Col →
            </Button>
          </Group>
          <Group gap={4}>
            <Button size="compact-xs" color="red" variant="light" onClick={() => deleteRow(ctx, active)}>
              Delete row
            </Button>
            <Button size="compact-xs" color="red" variant="light" onClick={() => deleteColumn(ctx, active)}>
              Delete column
            </Button>
          </Group>
          <Group gap={4}>
            <Button size="compact-xs" variant="default" disabled={!canMerge(active, 'right')} onClick={() => mergeCells(ctx, active, 'right')}>
              Merge →
            </Button>
            <Button size="compact-xs" variant="default" disabled={!canMerge(active, 'down')} onClick={() => mergeCells(ctx, active, 'down')}>
              Merge ↓
            </Button>
            <Button size="compact-xs" variant="default" disabled={!canSplit(active)} onClick={() => splitCell(ctx, active)}>
              Split
            </Button>
          </Group>
        </>
      )}
    </Stack>
  );
}
