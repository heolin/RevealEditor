/**
 * The "Image" tab (shown only while an image is selected). Visual mask picker —
 * each swatch previews the real clip-path shape. Picking one applies the mask
 * and enters mask mode (drag handles on the canvas fine-tune it). No number
 * fields: geometry is edited directly on the image.
 */
import { Button, Group, SegmentedControl, SimpleGrid, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconCrop } from '@tabler/icons-react';
import { useEditorStore } from '../../editor/editorStore';
import { commit, setElementStyleProp } from '../../editor/commands';
import { applyStyle } from '../../editor/geometry';
import { BorderWidthPicker, LineStylePicker, ReColorInput } from '../pickers';
import {
  MASK_OPTIONS,
  clipPathFor,
  maskKindOf,
  parseMaskShape,
  type MaskKind,
} from '../../editor/mask';

const RADIUS_PRESETS: { label: string; value: string }[] = [
  { label: 'None', value: '' },
  { label: 'S', value: '8px' },
  { label: 'M', value: '16px' },
  { label: 'L', value: '28px' },
  { label: 'Round', value: '50%' },
];

export function ImagePanel() {
  useEditorStore((s) => s.docVersion);
  const ctx = useEditorStore((s) => s.ctx);
  const sel = useEditorStore((s) => s.selectedEl);
  const el = sel && sel.tagName === 'IMG' ? (sel as HTMLImageElement) : null;

  if (!ctx || !el) {
    return (
      <Text size="sm" c="dimmed" p="sm">
        Select an image to edit its mask.
      </Text>
    );
  }

  const active = maskKindOf(parseMaskShape(el.style.clipPath));

  const pick = (kind: MaskKind) => {
    setElementStyleProp(ctx, el, 'clip-path', clipPathFor(kind));
    useEditorStore.getState().setMaskEl(kind === 'none' ? null : el);
  };

  const fit = el.style.objectFit || 'fill';
  const setFit = (v: string) => {
    const patch: Record<string, string | null> = { 'object-fit': v === 'fill' ? null : v };
    // cover/contain only bite once the box has an explicit height.
    if ((v === 'cover' || v === 'contain') && (!el.style.height || el.style.height === 'auto')) {
      patch.height = `${Math.round(el.getBoundingClientRect().height)}px`;
    }
    applyStyle(el, patch);
    commit(ctx);
  };

  const borderW = parseInt(el.style.borderWidth || '0', 10) || 0;
  const setBorder = (patch: Record<string, string | null>) => {
    applyStyle(el, patch);
    commit(ctx);
  };
  const radius = el.style.borderRadius || '';

  return (
    <Stack gap="sm" p="xs">
      <Text size="xs" fw={600} c="dimmed">
        MASK
      </Text>
      <SimpleGrid cols={4} spacing="xs">
        {MASK_OPTIONS.map((o) => (
          <UnstyledButton
            key={o.value}
            className={`mask-swatch${active === o.value ? ' active' : ''}`}
            onClick={() => pick(o.value)}
            title={o.label}
          >
            <div className="mask-swatch-fill" style={{ clipPath: clipPathFor(o.value) ?? 'none' }} />
            <span>{o.label}</span>
          </UnstyledButton>
        ))}
      </SimpleGrid>
      <Text size="xs" c="dimmed">
        Drag the handles on the image to fine-tune the mask.
      </Text>
      <Button
        size="xs"
        variant="light"
        leftSection={<IconCrop size={14} />}
        onClick={() => useEditorStore.getState().setCropEl(el)}
      >
        Crop image
      </Button>

      <Text size="xs" fw={600} c="dimmed" mt="xs">
        FIT
      </Text>
      <SegmentedControl
        size="xs"
        fullWidth
        value={fit}
        onChange={setFit}
        data={[
          { label: 'Fill', value: 'fill' },
          { label: 'Cover', value: 'cover' },
          { label: 'Contain', value: 'contain' },
        ]}
      />

      <Text size="xs" fw={600} c="dimmed" mt="xs">
        CORNERS
      </Text>
      <Group gap={4}>
        {RADIUS_PRESETS.map((r) => (
          <Button
            key={r.label}
            size="compact-xs"
            variant={radius === r.value ? 'filled' : 'default'}
            onClick={() => setBorder({ 'border-radius': r.value || null })}
          >
            {r.label}
          </Button>
        ))}
      </Group>

      <Text size="xs" fw={600} c="dimmed" mt="xs">
        BORDER
      </Text>
      <Group gap={8} wrap="nowrap" align="flex-end">
        <BorderWidthPicker
          label="Width"
          value={borderW}
          allowNone
          onChange={(w) =>
            setBorder(
              w > 0
                ? {
                    'border-width': `${w}px`,
                    'border-style': el.style.borderStyle || 'solid',
                    'border-color': el.style.borderColor || 'currentColor',
                  }
                : { 'border-width': null, 'border-style': null, 'border-color': null },
            )
          }
        />
        <LineStylePicker
          label="Style"
          value={(el.style.borderStyle as 'solid' | 'dashed' | 'dotted') || 'solid'}
          onChange={(v) => borderW > 0 && setBorder({ 'border-style': v })}
        />
        <ReColorInput
          key={`bc-${el.style.borderColor}`}
          label="Color"
          defaultValue={el.style.borderColor}
          placeholder="theme"
          disabled={borderW === 0}
          onChangeEnd={(v) => borderW > 0 && setBorder({ 'border-color': v || 'currentColor' })}
        />
      </Group>
    </Stack>
  );
}
