import { useRef } from 'react';
import {
  Button,
  ColorInput,
  Divider,
  Group,
  NumberInput,
  Select,
  Slider,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconUpload } from '@tabler/icons-react';
import { useEditorStore } from '../../editor/editorStore';
import { useDeckStore } from '../../state/deckStore';
import { handlerFor } from '../../editor/registry';
import { languageOf } from '../../editor/codeHighlight';
import { setElementAttr, setSectionAttr } from '../../editor/commands';
import {
  FRAGMENT_VARIANTS,
  applyFragmentStep,
  effectiveFragments,
  fragmentVariant,
  isFragment,
  moveFragment,
  setFragment,
  setFragmentIndex,
  setFragmentVariant,
  showAllFragments,
} from '../../editor/fragments';
import { isShapeEl, readShapeSpec, renderShapeInto, writeShapeSpec } from '../../editor/shapes';
import { isChartEl, readChartSpec, refreshChart } from '../../editor/chart/chart';
import { applyStyle, isAbsolute, returnToFlow } from '../../editor/geometry';
import { commit as commitCommand } from '../../editor/commands';
import {
  TABLE_PRESETS,
  type TablePreset,
  addColumn,
  addRow,
  deleteColumn,
  deleteRow,
  hasHeaderRow,
  setColumnAlignment,
  setTablePreset,
  tablePreset,
  toggleHeaderRow,
} from '../../editor/table';
import { api } from '../../api/client';

const TRANSITIONS = ['none', 'fade', 'slide', 'convex', 'concave', 'zoom'];

/**
 * Context-sensitive properties panel. Reads straight from the live stage DOM
 * (docVersion re-renders keep it fresh); writes go through commands.
 */
export function InspectorPanel() {
  useEditorStore((s) => s.docVersion);
  const ctx = useEditorStore((s) => s.ctx);
  const selectedEl = useEditorStore((s) => s.selectedEl);

  if (!ctx) return null;
  const el = selectedEl?.isConnected ? selectedEl : null;

  return (
    <div className="inspector">
      <Stack gap="sm" p="sm">
        {el ? <ElementSection el={el} /> : <SlideSection />}
      </Stack>
    </div>
  );
}

function SlideSection() {
  const ctx = useEditorStore((s) => s.ctx)!;
  const section = ctx.section;
  const meta = useDeckStore((s) => s.meta)!;
  const slideId = useDeckStore((s) => s.selectedSlideId);
  const fileRef = useRef<HTMLInputElement>(null);

  const bgColor = section.getAttribute('data-background-color') ?? '';
  const bgImage = section.getAttribute('data-background-image') ?? '';
  const transition = section.getAttribute('data-transition') ?? '';
  const hidden = section.getAttribute('data-visibility') === 'hidden';

  // Inputs are uncontrolled (commit on blur/pick, not per keystroke — one
  // undo entry per change); the key refreshes them on slide switch or undo.
  const inputKey = `${slideId}-${bgColor}-${bgImage}`;

  return (
    <>
      <Text size="xs" fw={700} c="dimmed" tt="uppercase">
        Slide
      </Text>
      <ColorInput
        key={`c-${inputKey}`}
        label="Background color"
        size="xs"
        defaultValue={bgColor}
        onChangeEnd={(v) => v !== bgColor && setSectionAttr(ctx, 'data-background-color', v || null)}
        placeholder="theme default"
        withEyeDropper={false}
      />
      {bgColor && (
        <Button size="compact-xs" variant="subtle" onClick={() => setSectionAttr(ctx, 'data-background-color', null)}>
          Clear background color
        </Button>
      )}
      <TextInput
        key={`i-${inputKey}`}
        label="Background image"
        size="xs"
        defaultValue={bgImage}
        placeholder="URL or upload →"
        onBlur={(e) =>
          e.currentTarget.value !== bgImage &&
          setSectionAttr(ctx, 'data-background-image', e.currentTarget.value || null)
        }
        rightSection={
          <Button
            size="compact-xs"
            variant="subtle"
            onClick={() => fileRef.current?.click()}
            title="Upload image"
          >
            <IconUpload size={14} />
          </Button>
        }
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const { url } = await api.uploadAsset(meta.path, file);
          setSectionAttr(ctx, 'data-background-image', url);
          e.target.value = '';
        }}
      />
      <Select
        label="Transition"
        size="xs"
        value={transition || null}
        placeholder="deck default"
        clearable
        data={TRANSITIONS}
        onChange={(v) => setSectionAttr(ctx, 'data-transition', v)}
      />
      <Switch
        label="Hidden slide"
        size="xs"
        checked={hidden}
        onChange={(e) => setSectionAttr(ctx, 'data-visibility', e.currentTarget.checked ? 'hidden' : null)}
      />
      <Divider />
      <FragmentsOverview />
      <Divider />
      <Text size="xs" c="dimmed">
        Click an element on the slide to edit its properties.
      </Text>
    </>
  );
}

/** Fragment list + step preview for the whole slide. */
function FragmentsOverview() {
  const ctx = useEditorStore((s) => s.ctx)!;
  const step = useEditorStore((s) => s.fragmentStep);
  const fragments = effectiveFragments(ctx.section);

  if (fragments.length === 0) {
    return (
      <Text size="xs" c="dimmed">
        No fragments yet — select an element and enable “Fragment” to reveal it step by step.
      </Text>
    );
  }

  function preview(value: number) {
    applyFragmentStep(ctx.section, value);
    useEditorStore.getState().setFragmentStep(value);
  }

  return (
    <>
      <Text size="xs" fw={700} c="dimmed" tt="uppercase">
        Fragments
      </Text>
      <Slider
        size="sm"
        min={0}
        max={fragments.length}
        step={1}
        value={step ?? fragments.length}
        onChange={preview}
        onChangeEnd={() => {
          // Leaving the slider back at "all" restores editing default.
          if ((useEditorStore.getState().fragmentStep ?? fragments.length) >= fragments.length) {
            showAllFragments(ctx.section);
            useEditorStore.getState().setFragmentStep(null);
          }
        }}
        marks={[{ value: 0, label: '0' }, { value: fragments.length, label: 'all' }]}
        mb="sm"
      />
      <Stack gap={4}>
        {fragments.map((el, i) => (
          <Group key={i} gap={4} wrap="nowrap">
            <Text
              size="xs"
              style={{ cursor: 'pointer', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              onClick={() => useEditorStore.getState().select(el)}
            >
              {i + 1}. {'<'}{el.tagName.toLowerCase()}{'>'} {el.textContent?.slice(0, 32)}
            </Text>
            <Button.Group>
              <Button size="compact-xs" variant="default" disabled={i === 0} onClick={() => moveFragment(ctx, el, -1)}>
                <IconArrowUp size={12} />
              </Button>
              <Button
                size="compact-xs"
                variant="default"
                disabled={i === fragments.length - 1}
                onClick={() => moveFragment(ctx, el, 1)}
              >
                <IconArrowDown size={12} />
              </Button>
            </Button.Group>
          </Group>
        ))}
      </Stack>
    </>
  );
}

function ElementSection({ el }: { el: HTMLElement }) {
  const handler = handlerFor(el);
  const ctx = useEditorStore((s) => s.ctx)!;
  const table = el.closest('table');

  return (
    <>
      <Text size="xs" fw={700} c="dimmed" tt="uppercase">
        {handler.type} — {'<'}{el.tagName.toLowerCase()}{'>'}
      </Text>
      {handler.type === 'image' && <ImageFields el={el as HTMLImageElement} />}
      {handler.type === 'code' && <CodeFields el={el} />}
      {handler.type === 'shape' && <ShapeFields el={el} />}
      {handler.type === 'chart' && <ChartFields el={el} />}
      {table && ctx.section.contains(table) && (
        <>
          <Divider />
          <TableFields table={table as HTMLTableElement} el={el} />
        </>
      )}
      {isAbsolute(el) && (
        <>
          <Divider />
          <PositionFields el={el} />
        </>
      )}
      <Divider />
      <FragmentFields el={table && el !== (table as HTMLElement) ? (table as HTMLElement) : el} />
    </>
  );
}

function PositionFields({ el }: { el: HTMLElement }) {
  const ctx = useEditorStore((s) => s.ctx)!;
  const num = (v: string) => parseInt(v, 10) || 0;

  function setStyleProp(prop: string, value: string) {
    applyStyle(el, { [prop]: value });
    if (isShapeEl(el)) renderShapeInto(el);
    else if (isChartEl(el)) refreshChart(ctx, el);
    commitCommand(ctx);
  }

  return (
    <>
      <Text size="xs" fw={700} c="dimmed" tt="uppercase">
        Position
      </Text>
      <Group gap={4} grow>
        <NumberInput
          label="X"
          size="xs"
          value={num(el.style.left)}
          onChange={(v) => typeof v === 'number' && setStyleProp('left', `${v}px`)}
        />
        <NumberInput
          label="Y"
          size="xs"
          value={num(el.style.top)}
          onChange={(v) => typeof v === 'number' && setStyleProp('top', `${v}px`)}
        />
      </Group>
      <Group gap={4} grow>
        <NumberInput
          label="Width"
          size="xs"
          value={num(el.style.width)}
          min={16}
          onChange={(v) => typeof v === 'number' && setStyleProp('width', `${v}px`)}
        />
        {el.style.height ? (
          <NumberInput
            label="Height"
            size="xs"
            value={num(el.style.height)}
            min={16}
            onChange={(v) => typeof v === 'number' && setStyleProp('height', `${v}px`)}
          />
        ) : (
          <div />
        )}
      </Group>
      <Button size="compact-xs" variant="light" onClick={() => returnToFlow(ctx, el)}>
        Back to layout (unpin)
      </Button>
    </>
  );
}

function TableFields({ table, el }: { table: HTMLTableElement; el: HTMLElement }) {
  const ctx = useEditorStore((s) => s.ctx)!;
  const cell = (el.closest('td, th') as HTMLTableCellElement | null) ?? null;
  const alignments = ['left', 'center', 'right'] as const;
  const currentAlign = cell?.style.textAlign || '';

  return (
    <>
      <Text size="xs" fw={700} c="dimmed" tt="uppercase">
        Table
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
      {cell ? (
        <>
          <Group gap={4}>
            <Button size="compact-xs" variant="default" onClick={() => addRow(ctx, cell, 'above')}>
              + Row ↑
            </Button>
            <Button size="compact-xs" variant="default" onClick={() => addRow(ctx, cell, 'below')}>
              + Row ↓
            </Button>
            <Button size="compact-xs" variant="default" onClick={() => addColumn(ctx, cell, 'left')}>
              + Col ←
            </Button>
            <Button size="compact-xs" variant="default" onClick={() => addColumn(ctx, cell, 'right')}>
              + Col →
            </Button>
          </Group>
          <Group gap={4}>
            <Button size="compact-xs" color="red" variant="light" onClick={() => deleteRow(ctx, cell)}>
              Delete row
            </Button>
            <Button size="compact-xs" color="red" variant="light" onClick={() => deleteColumn(ctx, cell)}>
              Delete column
            </Button>
          </Group>
          <Text size="xs" c="dimmed">
            Column alignment
          </Text>
          <Button.Group>
            {alignments.map((a) => (
              <Button
                key={a}
                size="compact-xs"
                variant={currentAlign === a ? 'filled' : 'default'}
                onClick={() => setColumnAlignment(ctx, cell, currentAlign === a ? null : a)}
              >
                {a}
              </Button>
            ))}
          </Button.Group>
        </>
      ) : (
        <Text size="xs" c="dimmed">
          Click into a cell for row/column operations. Tab / Shift+Tab moves between cells.
        </Text>
      )}
    </>
  );
}

function FragmentFields({ el }: { el: HTMLElement }) {
  const ctx = useEditorStore((s) => s.ctx)!;
  const on = isFragment(el);
  const index = el.getAttribute('data-fragment-index');

  return (
    <>
      <Text size="xs" fw={700} c="dimmed" tt="uppercase">
        Fragment
      </Text>
      <Switch
        label="Reveal step by step"
        size="xs"
        checked={on}
        onChange={(e) => setFragment(ctx, el, e.currentTarget.checked)}
      />
      {on && (
        <>
          <Select
            label="Effect"
            size="xs"
            value={fragmentVariant(el)}
            data={FRAGMENT_VARIANTS}
            onChange={(v) => v && setFragmentVariant(ctx, el, v)}
            searchable
          />
          <NumberInput
            label="Order (data-fragment-index)"
            size="xs"
            placeholder="document order"
            defaultValue={index ? parseInt(index, 10) : undefined}
            key={`fi-${index ?? 'auto'}`}
            min={0}
            onBlur={(e) => {
              const v = e.currentTarget.value.trim();
              if (v !== (index ?? '')) setFragmentIndex(ctx, el, v === '' ? null : parseInt(v, 10));
            }}
          />
        </>
      )}
    </>
  );
}

function ImageFields({ el }: { el: HTMLImageElement }) {
  const ctx = useEditorStore((s) => s.ctx)!;
  const meta = useDeckStore((s) => s.meta)!;
  const fileRef = useRef<HTMLInputElement>(null);
  const src = el.getAttribute('src') ?? '';
  const alt = el.getAttribute('alt') ?? '';
  const width = el.getAttribute('width');
  const inputKey = `${src}-${alt}-${width}`;

  return (
    <>
      <TextInput
        key={`src-${inputKey}`}
        label="Source"
        size="xs"
        defaultValue={src}
        onBlur={(e) =>
          e.currentTarget.value !== src && setElementAttr(ctx, el, 'src', e.currentTarget.value)
        }
        rightSection={
          <Button size="compact-xs" variant="subtle" onClick={() => fileRef.current?.click()}>
            <IconUpload size={14} />
          </Button>
        }
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const { url } = await api.uploadAsset(meta.path, file);
          setElementAttr(ctx, el, 'src', url);
          e.target.value = '';
        }}
      />
      <TextInput
        key={`alt-${inputKey}`}
        label="Alt text"
        size="xs"
        defaultValue={alt}
        onBlur={(e) =>
          e.currentTarget.value !== alt &&
          setElementAttr(ctx, el, 'alt', e.currentTarget.value || null)
        }
      />
      <NumberInput
        key={`w-${inputKey}`}
        label="Width (px)"
        size="xs"
        defaultValue={width ? parseInt(width, 10) : undefined}
        placeholder="natural"
        min={16}
        onBlur={(e) => {
          const v = e.currentTarget.value.trim();
          if (v !== (width ?? '')) setElementAttr(ctx, el, 'width', v || null);
        }}
      />
    </>
  );
}

function ShapeFields({ el }: { el: HTMLElement }) {
  const ctx = useEditorStore((s) => s.ctx)!;
  const spec = readShapeSpec(el);
  if (!spec) return null;
  const hasFill = spec.kind === 'rect' || spec.kind === 'ellipse';

  return (
    <>
      {hasFill && (
        <ColorInput
          key={`f-${spec.fill}`}
          label="Fill"
          size="xs"
          defaultValue={spec.fill === 'none' ? '' : spec.fill}
          onChangeEnd={(v) => writeShapeSpec(ctx, el, { fill: v || 'none' })}
          withEyeDropper={false}
        />
      )}
      <ColorInput
        key={`s-${spec.stroke}`}
        label={hasFill ? 'Border color' : 'Color'}
        size="xs"
        defaultValue={spec.stroke === 'none' ? '' : spec.stroke}
        onChangeEnd={(v) => writeShapeSpec(ctx, el, { stroke: v || 'none' })}
        withEyeDropper={false}
      />
      <NumberInput
        label={hasFill ? 'Border width' : 'Line width'}
        size="xs"
        min={0}
        max={40}
        value={spec.strokeWidth}
        onChange={(v) => typeof v === 'number' && writeShapeSpec(ctx, el, { strokeWidth: v })}
      />
      <Select
        label="Line style"
        size="xs"
        value={spec.dash}
        data={['solid', 'dashed', 'dotted']}
        onChange={(v) => v && writeShapeSpec(ctx, el, { dash: v as 'solid' | 'dashed' | 'dotted' })}
      />
      {spec.kind === 'rect' && (
        <NumberInput
          label="Corner radius"
          size="xs"
          min={0}
          max={100}
          value={spec.radius ?? 0}
          onChange={(v) => typeof v === 'number' && writeShapeSpec(ctx, el, { radius: v })}
        />
      )}
      <Text size="xs" c="dimmed">
        Opacity
      </Text>
      <Slider
        size="sm"
        min={0.1}
        max={1}
        step={0.05}
        value={spec.opacity}
        onChangeEnd={(v) => writeShapeSpec(ctx, el, { opacity: v })}
      />
    </>
  );
}

function ChartFields({ el }: { el: HTMLElement }) {
  const spec = readChartSpec(el);
  return (
    <>
      <Text size="xs" c="dimmed">
        {spec ? `${spec.type} · ${spec.series.length} series · ${spec.labels.length} rows` : 'Invalid chart spec'}
      </Text>
      <Group>
        <Button
          size="compact-xs"
          variant="light"
          onClick={() => useEditorStore.getState().setChartEditEl(el)}
        >
          Edit chart…
        </Button>
      </Group>
    </>
  );
}

function CodeFields({ el }: { el: HTMLElement }) {
  const code = el.querySelector('code');
  return (
    <>
      <Text size="xs" c="dimmed">
        Language: {code ? languageOf(code) ?? 'plain' : '—'}
        {code?.getAttribute('data-line-numbers')
          ? ` · steps: ${code.getAttribute('data-line-numbers')}`
          : ''}
      </Text>
      <Group>
        <Button
          size="compact-xs"
          variant="light"
          onClick={() => useEditorStore.getState().setCodeEditEl(el)}
        >
          Edit code…
        </Button>
      </Group>
    </>
  );
}
