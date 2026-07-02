import { Button, Group, NumberInput, Paper, Text, Tooltip } from '@mantine/core';
import { useEditorStore } from '../../editor/editorStore';
import { useEditorContext } from '../../editor/actions/context';
import { buildEditorContext, getAction } from '../../editor/actions';
import { columnRatios, setColumnRatios } from '../../editor/geometry';

/** Mini diagram tiles for the layout components. */
const TILES: { id: string; label: string; cols: number[] }[] = [
  { id: 'insert.cell', label: 'Single cell', cols: [1] },
  { id: 'insert.columns2', label: 'Two columns', cols: [1, 1] },
  { id: 'insert.columns3', label: 'Three columns', cols: [1, 1, 1] },
];

const RATIO_PRESETS: { label: string; ratios: number[] }[] = [
  { label: '1 : 1', ratios: [1, 1] },
  { label: '1 : 2', ratios: [1, 2] },
  { label: '2 : 1', ratios: [2, 1] },
  { label: '1 : 1 : 1', ratios: [1, 1, 1] },
  { label: '1 : 2 : 1', ratios: [1, 2, 1] },
];

/**
 * The layout palette — visible only in layout mode. Insert layout
 * containers, and edit column width proportions of the selected columns
 * container (flex ratios, plain CSS in the file).
 */
export function LayoutPanel() {
  const layoutMode = useEditorStore((s) => s.layoutMode);
  const ctx = useEditorContext();
  if (!layoutMode || !ctx.stage) return null;

  const colsEl = (ctx.selection?.closest('.re-cols') ?? null) as HTMLElement | null;
  const inStage = colsEl && ctx.stage.section.contains(colsEl) ? colsEl : null;
  const ratios = inStage ? columnRatios(inStage) : null;

  return (
    <Paper className="layout-panel" shadow="md" withBorder p="xs">
      <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={6}>
        Layout
      </Text>
      <div className="layout-tiles">
        {TILES.map((tile) => (
          <Tooltip key={tile.id} label={tile.label} position="right">
            <button
              className="layout-tile"
              aria-label={tile.label}
              onClick={() => getAction(tile.id)?.run(buildEditorContext())}
            >
              {tile.cols.map((_, i) => (
                <span key={i} className="layout-tile-col" />
              ))}
            </button>
          </Tooltip>
        ))}
      </div>

      {inStage && ratios && (
        <>
          <Text size="xs" fw={700} c="dimmed" tt="uppercase" mt="sm" mb={4}>
            Column widths
          </Text>
          <Group gap={4} wrap="nowrap">
            {ratios.map((r, i) => (
              <NumberInput
                key={`${i}-${r}`}
                size="xs"
                w={52}
                min={1}
                max={12}
                defaultValue={r}
                aria-label={`Column ${i + 1} ratio`}
                onBlur={(e) => {
                  const v = parseFloat(e.currentTarget.value);
                  if (!Number.isFinite(v) || v === r) return;
                  const next = [...ratios];
                  next[i] = v;
                  setColumnRatios(ctx.stage!, inStage, next);
                }}
              />
            ))}
          </Group>
          <Group gap={4} mt={6}>
            {RATIO_PRESETS.filter((p) => p.ratios.length === ratios.length).map((p) => (
              <Button
                key={p.label}
                size="compact-xs"
                variant="default"
                onClick={() => setColumnRatios(ctx.stage!, inStage, p.ratios)}
              >
                {p.label}
              </Button>
            ))}
          </Group>
        </>
      )}
      {!inStage && (
        <Text size="xs" c="dimmed" mt={6} w={150}>
          Select a columns container to edit its proportions.
        </Text>
      )}
    </Paper>
  );
}
