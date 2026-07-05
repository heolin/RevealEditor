/**
 * The "Effects" tab (shown while any element is selected). Visual effect
 * presets applied as inline CSS `filter`. Shadow first (drop-shadow, so it
 * follows the element's real shape); opacity/blur/color filters slot in here
 * next via the same filter-aware helpers in editor/effects.ts.
 */
import { Button, Divider, Group, SimpleGrid, Slider, Stack, Text, UnstyledButton } from '@mantine/core';
import { useEditorStore } from '../../editor/editorStore';
import { commit } from '../../editor/commands';
import { applyStyle } from '../../editor/geometry';
import { ReColorInput } from '../pickers';
import {
  SHADOW_PRESETS,
  composeFilter,
  hasFilter,
  readFilterNum,
  readShadow,
  setShadow,
  shadowPresetKey,
  shadowToFilter,
} from '../../editor/effects';

export function EffectsPanel() {
  useEditorStore((s) => s.docVersion);
  const ctx = useEditorStore((s) => s.ctx);
  const el = useEditorStore((s) => s.selectedEl);

  if (!ctx || !el || !el.isConnected) {
    return (
      <Text size="sm" c="dimmed" p="sm">
        Select an element to add effects.
      </Text>
    );
  }

  const shadow = readShadow(el);
  const activeKey = shadowPresetKey(shadow);

  const bump = () => useEditorStore.getState().bump();
  // Live-apply a filter function while dragging (no commit); commit on release.
  const liveFilter = (name: string, fn: string | null) => {
    applyStyle(el, { filter: composeFilter(el, name, fn) || null });
    bump();
  };
  const toggleFilter = (name: string, on: string) => {
    liveFilter(name, hasFilter(el, name) ? null : on);
    commit(ctx);
  };

  const opacity = el.style.opacity ? Math.round(parseFloat(el.style.opacity) * 100) : 100;
  const blur = readFilterNum(el, 'blur') ?? 0;
  const brightness = readFilterNum(el, 'brightness') ?? 100;
  const saturate = readFilterNum(el, 'saturate') ?? 100;

  return (
    <Stack gap="sm" p="xs">
      <Text size="xs" fw={600} c="dimmed">
        SHADOW
      </Text>
      <SimpleGrid cols={5} spacing="xs">
        {SHADOW_PRESETS.map((p) => (
          <UnstyledButton
            key={p.key}
            className={`effect-swatch${activeKey === p.key ? ' active' : ''}`}
            title={p.label}
            onClick={() => setShadow(ctx, el, p.shadow)}
          >
            <div
              className="effect-swatch-fill"
              style={{
                filter: p.shadow
                  ? shadowToFilter({
                      ...p.shadow,
                      dy: Math.min(p.shadow.dy, 4),
                      blur: Math.min(p.shadow.blur, 6),
                    })
                  : 'none',
              }}
            />
            <span>{p.label}</span>
          </UnstyledButton>
        ))}
      </SimpleGrid>
      <ReColorInput
        key={`sh-${shadow?.color ?? ''}`}
        label="Shadow color"
        defaultValue={shadow?.color}
        placeholder="none"
        disabled={!shadow}
        onChangeEnd={(v) => shadow && v && setShadow(ctx, el, { ...shadow, color: v })}
      />
      <Text size="xs" c="dimmed">
        Shadow follows the element&apos;s shape — masked images, shapes, and text.
      </Text>

      <Divider />
      <Text size="xs" fw={600} c="dimmed">
        OPACITY
      </Text>
      <Slider
        value={opacity}
        min={0}
        max={100}
        label={(v) => `${v}%`}
        onChange={(v) => {
          applyStyle(el, { opacity: v < 100 ? String(v / 100) : null });
          bump();
        }}
        onChangeEnd={() => commit(ctx)}
      />

      <Divider />
      <Text size="xs" fw={600} c="dimmed">
        BLUR
      </Text>
      <Slider
        value={blur}
        min={0}
        max={20}
        label={(v) => `${v}px`}
        onChange={(v) => liveFilter('blur', v > 0 ? `blur(${v}px)` : null)}
        onChangeEnd={() => commit(ctx)}
      />

      <Divider />
      <Text size="xs" fw={600} c="dimmed">
        ADJUST
      </Text>
      <Group gap={4}>
        <Button
          size="compact-xs"
          variant={hasFilter(el, 'grayscale') ? 'filled' : 'default'}
          onClick={() => toggleFilter('grayscale', 'grayscale(100%)')}
        >
          Grayscale
        </Button>
        <Button
          size="compact-xs"
          variant={hasFilter(el, 'sepia') ? 'filled' : 'default'}
          onClick={() => toggleFilter('sepia', 'sepia(100%)')}
        >
          Sepia
        </Button>
        <Button
          size="compact-xs"
          variant={hasFilter(el, 'invert') ? 'filled' : 'default'}
          onClick={() => toggleFilter('invert', 'invert(100%)')}
        >
          Invert
        </Button>
      </Group>
      <Text size="xs" c="dimmed">
        Brightness
      </Text>
      <Slider
        value={brightness}
        min={0}
        max={200}
        label={(v) => `${v}%`}
        onChange={(v) => liveFilter('brightness', v !== 100 ? `brightness(${v}%)` : null)}
        onChangeEnd={() => commit(ctx)}
      />
      <Text size="xs" c="dimmed">
        Saturation
      </Text>
      <Slider
        value={saturate}
        min={0}
        max={200}
        label={(v) => `${v}%`}
        onChange={(v) => liveFilter('saturate', v !== 100 ? `saturate(${v}%)` : null)}
        onChangeEnd={() => commit(ctx)}
      />
    </Stack>
  );
}
