import { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Button,
  ColorInput,
  Group,
  Modal,
  Select,
  Stack,
  Switch,
  Table,
  Textarea,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { IconPlus, IconTrash, IconX } from '@tabler/icons-react';
import { useEditorStore } from '../editorStore';
import { type ChartSpec, renderChart, seriesColor } from './renderChart';
import {
  chartMode,
  defaultChartSpec,
  parseDelimited,
  readChartSpec,
  slideBackgroundColor,
  writeChartSpec,
} from './chart';

const CHART_TYPES = [
  { value: 'bar', label: 'Bar' },
  { value: 'stackedBar', label: 'Stacked bar' },
  { value: 'line', label: 'Line' },
  { value: 'area', label: 'Area' },
  { value: 'pie', label: 'Pie' },
  { value: 'donut', label: 'Donut' },
  { value: 'scatter', label: 'Scatter (numeric labels = x)' },
];

/** Chart editor: spreadsheet-ish grid + options + live preview. */
export function ChartModal() {
  const el = useEditorStore((s) => s.chartEditEl);
  const ctx = useEditorStore((s) => s.ctx);
  const [spec, setSpec] = useState<ChartSpec | null>(null);
  const [importText, setImportText] = useState('');

  useEffect(() => {
    if (el) setSpec(readChartSpec(el) ?? defaultChartSpec());
  }, [el]);

  const mode = ctx ? chartMode(ctx) : 'dark';
  const preview = useMemo(
    () => (spec ? renderChart(spec, 560, 320, mode) : ''),
    [spec, mode],
  );

  if (!el || !ctx || !spec) return null;

  const close = () => useEditorStore.getState().setChartEditEl(null);

  function patch(p: Partial<ChartSpec>) {
    setSpec((s) => (s ? { ...s, ...p } : s));
  }
  function patchOptions(p: Partial<NonNullable<ChartSpec['options']>>) {
    setSpec((s) => (s ? { ...s, options: { ...s.options, ...p } } : s));
  }
  function setCell(row: number, col: number, value: string) {
    setSpec((s) => {
      if (!s) return s;
      if (col === 0) {
        const labels = [...s.labels];
        labels[row] = value;
        return { ...s, labels };
      }
      const series = s.series.map((sr, i) =>
        i === col - 1
          ? { ...sr, values: sr.values.map((v, r) => (r === row ? parseFloat(value) || 0 : v)) }
          : sr,
      );
      return { ...s, series };
    });
  }

  return (
    <Modal opened onClose={close} title="Edit chart" size="70rem">
      <Group align="flex-start" gap="lg" wrap="nowrap">
        <Stack gap="sm" style={{ flex: 1, minWidth: 0 }}>
          <Group gap="sm">
            <Select
              label="Type"
              size="xs"
              w={190}
              value={spec.type}
              data={CHART_TYPES}
              onChange={(v) => v && patch({ type: v as ChartSpec['type'] })}
            />
            <TextInput
              label="Title"
              size="xs"
              style={{ flex: 1 }}
              value={spec.options?.title ?? ''}
              onChange={(e) => patchOptions({ title: e.currentTarget.value || undefined })}
            />
          </Group>
          <Group gap="lg">
            <Switch
              label="Value labels (endpoints / caps / big slices)"
              size="xs"
              checked={spec.options?.valueLabels ?? false}
              onChange={(e) => patchOptions({ valueLabels: e.currentTarget.checked || undefined })}
            />
            <Switch
              label="Legend"
              size="xs"
              checked={spec.options?.legend ?? spec.series.length >= 2}
              onChange={(e) => patchOptions({ legend: e.currentTarget.checked })}
            />
          </Group>

          <Table withColumnBorders withTableBorder verticalSpacing={2} horizontalSpacing={4}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={130}>Label</Table.Th>
                {spec.series.map((s, i) => (
                  <Table.Th key={i}>
                    <Group gap={4} wrap="nowrap">
                      <ColorInput
                        size="xs"
                        w={40}
                        value={seriesColor(spec, i, mode)}
                        onChangeEnd={(c) =>
                          setSpec((sp) =>
                            sp
                              ? {
                                  ...sp,
                                  series: sp.series.map((sr, j) =>
                                    j === i ? { ...sr, color: c } : sr,
                                  ),
                                }
                              : sp,
                          )
                        }
                        withEyeDropper={false}
                        variant="unstyled"
                      />
                      <TextInput
                        size="xs"
                        variant="unstyled"
                        value={s.name}
                        onChange={(e) =>
                          setSpec((sp) =>
                            sp
                              ? {
                                  ...sp,
                                  series: sp.series.map((sr, j) =>
                                    j === i ? { ...sr, name: e.currentTarget.value } : sr,
                                  ),
                                }
                              : sp,
                          )
                        }
                      />
                      <ActionIcon
                        size="xs"
                        variant="subtle"
                        color="red"
                        disabled={spec.series.length <= 1}
                        onClick={() =>
                          setSpec((sp) =>
                            sp ? { ...sp, series: sp.series.filter((_, j) => j !== i) } : sp,
                          )
                        }
                      >
                        <IconX size={12} />
                      </ActionIcon>
                    </Group>
                  </Table.Th>
                ))}
                <Table.Th w={36}>
                  <Tooltip label="Add series">
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      onClick={() =>
                        setSpec((sp) =>
                          sp
                            ? {
                                ...sp,
                                series: [
                                  ...sp.series,
                                  {
                                    name: `Series ${String.fromCharCode(65 + sp.series.length)}`,
                                    values: sp.labels.map(() => 0),
                                  },
                                ],
                              }
                            : sp,
                        )
                      }
                    >
                      <IconPlus size={14} />
                    </ActionIcon>
                  </Tooltip>
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {spec.labels.map((label, r) => (
                <Table.Tr key={r}>
                  <Table.Td>
                    <TextInput
                      size="xs"
                      variant="unstyled"
                      value={label}
                      onChange={(e) => setCell(r, 0, e.currentTarget.value)}
                    />
                  </Table.Td>
                  {spec.series.map((s, c) => (
                    <Table.Td key={c}>
                      <TextInput
                        size="xs"
                        variant="unstyled"
                        styles={{ input: { textAlign: 'right', fontVariantNumeric: 'tabular-nums' } }}
                        value={String(s.values[r] ?? 0)}
                        onChange={(e) => setCell(r, c + 1, e.currentTarget.value)}
                      />
                    </Table.Td>
                  ))}
                  <Table.Td>
                    <ActionIcon
                      size="xs"
                      variant="subtle"
                      color="red"
                      disabled={spec.labels.length <= 1}
                      onClick={() =>
                        setSpec((sp) =>
                          sp
                            ? {
                                ...sp,
                                labels: sp.labels.filter((_, i) => i !== r),
                                series: sp.series.map((sr) => ({
                                  ...sr,
                                  values: sr.values.filter((_, i) => i !== r),
                                })),
                              }
                            : sp,
                        )
                      }
                    >
                      <IconTrash size={12} />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Button
            size="compact-xs"
            variant="default"
            onClick={() =>
              setSpec((sp) =>
                sp
                  ? {
                      ...sp,
                      labels: [...sp.labels, `Item ${sp.labels.length + 1}`],
                      series: sp.series.map((sr) => ({ ...sr, values: [...sr.values, 0] })),
                    }
                  : sp,
              )
            }
          >
            + Add row
          </Button>

          <Textarea
            label="Import data — paste CSV/TSV (first row = series names, first column = labels)"
            size="xs"
            autosize
            minRows={2}
            maxRows={5}
            value={importText}
            onChange={(e) => setImportText(e.currentTarget.value)}
          />
          {importText.trim() && (
            <Button
              size="compact-xs"
              variant="light"
              onClick={() => {
                const parsed = parseDelimited(importText);
                if (parsed) {
                  patch({ labels: parsed.labels, series: parsed.series });
                  setImportText('');
                }
              }}
            >
              Replace data with pasted table
            </Button>
          )}
        </Stack>

        <Stack gap="sm" w={580} style={{ flexShrink: 0 }}>
          <div
            className="chart-preview"
            // Preview on the slide's ACTUAL background so ink/palette read
            // exactly as they will on the slide.
            style={{ background: slideBackgroundColor(ctx) }}
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: preview }}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                writeChartSpec(ctx, el, spec);
                close();
              }}
            >
              Save chart
            </Button>
          </Group>
        </Stack>
      </Group>
    </Modal>
  );
}
