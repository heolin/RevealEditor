import { useEffect, useRef, useState } from 'react';
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
  Tooltip,
} from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconUpload } from '@tabler/icons-react';
import { useEditorStore } from '../../editor/editorStore';
import { useDeckStore } from '../../state/deckStore';
import { getAction, useEditorContext, type Action } from '../../editor/actions';
import { ActionControl } from '../../editor/actions/ActionControl';
import { ArrowHeadsPicker, BorderWidthPicker, LineStylePicker, ReColorInput } from '../pickers';
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
import {
  isConnectorEl,
  isLineKind,
  isShapeEl,
  readShapeSpec,
  renderShapeInto,
  writeShapeSpec,
  type ArrowHeads,
} from '../../editor/shapes';
import { isChartEl, readChartSpec, refreshChart } from '../../editor/chart/chart';
import {
  applyStyle,
  flipState,
  isAbsolute,
  returnToFlow,
  rotation,
  setRotation,
  toggleFlip,
} from '../../editor/geometry';
import { commit as commitCommand } from '../../editor/commands';
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
        {el ? <ElementSection el={el} /> : (
          <>
            <DeckSection />
            <Divider />
            <SlideSection />
          </>
        )}
      </Stack>
    </div>
  );
}

const SIZE_PRESETS = [
  { value: '1280x720', label: '16:9 — 1280 × 720' },
  { value: '1280x800', label: '16:10 — 1280 × 800' },
  { value: '1024x768', label: '4:3 — 1024 × 768' },
  { value: '960x700', label: 'Classic — 960 × 700' },
];

/** Deck-level design settings (theme lives here, not in the toolbar). */
function DeckSection() {
  const meta = useDeckStore((s) => s.meta)!;
  const setTheme = useDeckStore((s) => s.setTheme);
  const setDeckSize = useDeckStore((s) => s.setDeckSize);
  const [themes, setThemes] = useState<string[]>([]);

  useEffect(() => {
    api.listThemes().then(setThemes).catch(() => setThemes([]));
  }, []);

  const { width, height } = meta.config;
  const sizeValue = `${width}x${height}`;
  const isPreset = SIZE_PRESETS.some((p) => p.value === sizeValue);
  const [customSize, setCustomSize] = useState(false);
  const showCustom = customSize || !isPreset;

  return (
    <>
      <Text size="xs" fw={700} c="dimmed" tt="uppercase">
        Deck
      </Text>
      <Select
        label="Size"
        size="xs"
        value={showCustom ? 'custom' : sizeValue}
        data={[...SIZE_PRESETS, { value: 'custom', label: 'Custom…' }]}
        onChange={(v) => {
          if (!v) return;
          if (v === 'custom') {
            setCustomSize(true);
            return;
          }
          setCustomSize(false);
          const [w, h] = v.split('x').map(Number);
          setDeckSize(w, h);
        }}
      />
      {showCustom && (
        <Group gap={4} grow>
          <NumberInput
            key={`w-${width}`}
            label="Width"
            size="xs"
            min={320}
            max={7680}
            defaultValue={width}
            onBlur={(e) => {
              const v = parseInt(e.currentTarget.value, 10);
              if (Number.isFinite(v) && v !== width) setDeckSize(v, height);
            }}
          />
          <NumberInput
            key={`h-${height}`}
            label="Height"
            size="xs"
            min={200}
            max={4320}
            defaultValue={height}
            onBlur={(e) => {
              const v = parseInt(e.currentTarget.value, 10);
              if (Number.isFinite(v) && v !== height) setDeckSize(width, v);
            }}
          />
        </Group>
      )}
      {meta.theme === null ? (
        <Tooltip label="This deck uses its own custom styling — there is no standard theme link to switch">
          <Select label="Theme" size="xs" placeholder="custom styling" data={[]} disabled />
        </Tooltip>
      ) : (
        <Select
          label="Theme"
          size="xs"
          value={meta.theme}
          data={themes}
          onChange={(v) => v && setTheme(v)}
          searchable
          comboboxProps={{ withinPortal: true }}
        />
      )}
      <Switch
        label="Slide numbers"
        size="xs"
        checked={meta.config.slideNumber}
        onChange={(e) => useDeckStore.getState().setSlideNumber(e.currentTarget.checked)}
      />
    </>
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
  const bgTransition = section.getAttribute('data-background-transition') ?? '';
  const autoAnimate = section.hasAttribute('data-auto-animate');
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
      <Select
        label="Background transition"
        size="xs"
        value={bgTransition || null}
        placeholder="deck default"
        clearable
        data={TRANSITIONS}
        onChange={(v) => setSectionAttr(ctx, 'data-background-transition', v)}
      />
      <Switch
        label="Auto-animate"
        size="xs"
        description="Morph matching elements from the previous slide"
        checked={autoAnimate}
        onChange={(e) => setSectionAttr(ctx, 'data-auto-animate', e.currentTarget.checked ? 'true' : null)}
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
      {handler.type === 'text' && (
        <>
          <TextFields />
          <BoxFields el={el} />
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
  const rot = rotation(el); // null = foreign transform → no rotation field

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
      <Group gap={4} grow wrap="nowrap">
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
      {rot !== null && !isConnectorEl(el) && (
        <NumberInput
          label="Rotation"
          size="xs"
          suffix="°"
          min={-180}
          max={180}
          value={rot}
          onChange={(v) => {
            if (typeof v !== 'number') return;
            setRotation(el, v);
            commitCommand(ctx);
          }}
        />
      )}
      <Button size="compact-xs" variant="light" onClick={() => returnToFlow(ctx, el)}>
        Back to layout (unpin)
      </Button>
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
  const flipped = flipState(el); // null = foreign transform → no flip UI

  return (
    <>
      {flipped && (
        <Group gap={4}>
          <Button
            size="compact-xs"
            variant={flipped.x ? 'filled' : 'default'}
            onClick={() => {
              toggleFlip(el, 'x');
              commitCommand(ctx);
            }}
          >
            Flip H
          </Button>
          <Button
            size="compact-xs"
            variant={flipped.y ? 'filled' : 'default'}
            onClick={() => {
              toggleFlip(el, 'y');
              commitCommand(ctx);
            }}
          >
            Flip V
          </Button>
        </Group>
      )}
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

/** Text-format action ids surfaced in the panel (same registry the textBar
 *  renders — these all work on a bare selection, no session required),
 *  packed into two compact rows. */
const TEXT_ROW_1 = ['format.heading', 'format.fontFamily', 'format.fontSize'];
const TEXT_ROW_2 = [
  'format.textColor',
  'format.align.left',
  'format.align.center',
  'format.align.right',
];

/**
 * Text styling for a SELECTED text box — the textBar only exists during an
 * edit session, but block-level format (font, size, color, alignment) is
 * just inline styles on the element and needs no session.
 */
function TextFields() {
  const ctx = useEditorContext();
  const row = (ids: string[]) =>
    ids.map(getAction).filter((a): a is Action => !!a && a.when(ctx));
  const row1 = row(TEXT_ROW_1);
  const row2 = row(TEXT_ROW_2);
  if (row1.length === 0 && row2.length === 0) return null;
  return (
    <>
      <Text size="xs" fw={700} c="dimmed" tt="uppercase">
        Text
      </Text>
      {[row1, row2].map(
        (actions, i) =>
          actions.length > 0 && (
            <Group key={i} gap={4} wrap="nowrap">
              {actions.map((action) => (
                <ActionControl key={action.id} action={action} ctx={ctx} variant="toolbar" />
              ))}
            </Group>
          ),
      )}
      {ctx.stage && ctx.selection && (
        <Switch
          label="Fit text to width (r-fit-text)"
          size="xs"
          checked={ctx.selection.classList.contains('r-fit-text')}
          onChange={() => {
            const el = ctx.selection!;
            el.classList.toggle('r-fit-text');
            if (!el.getAttribute('class')) el.removeAttribute('class');
            commitCommand(ctx.stage!);
          }}
        />
      )}
      <Divider />
    </>
  );
}

/**
 * Box styling for text elements — background, padding, border, radius as
 * plain inline styles (round-trip clean, presents anywhere). A text box with
 * a background + padding IS a diagram node: connector endpoints snap to its
 * anchors like any other box (docs/DIAGRAMMING.md phase 3).
 */
function BoxFields({ el }: { el: HTMLElement }) {
  const ctx = useEditorStore((s) => s.ctx)!;
  const num = (v: string) => parseInt(v, 10) || 0;
  const set = (patch: Parameters<typeof applyStyle>[1]) => {
    applyStyle(el, patch);
    commitCommand(ctx);
  };

  return (
    <>
      <Text size="xs" fw={700} c="dimmed" tt="uppercase">
        Box
      </Text>
      {/* Row 1: colors + border width/style; row 2: padding + radius. */}
      <Group gap={6} align="flex-end" wrap="nowrap">
        <ReColorInput
          key={`bg-${el.style.backgroundColor}`}
          label="Background"
          defaultValue={el.style.backgroundColor}
          placeholder="none"
          onChangeEnd={(v) => set({ 'background-color': v || null })}
        />
        <ReColorInput
          key={`bc-${el.style.borderColor}`}
          label="Border"
          defaultValue={el.style.borderColor}
          placeholder="text color"
          onChangeEnd={(v) => set({ 'border-color': v || null })}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <BorderWidthPicker
            label="Width"
            value={num(el.style.borderWidth)}
            allowNone
            onChange={(v) =>
              // Width 0 removes the whole border; color stays currentColor
              // (theme text color) until explicitly picked.
              set(
                v > 0
                  ? {
                      'border-width': `${v}px`,
                      'border-style': el.style.borderStyle || 'solid',
                    }
                  : { 'border-width': null, 'border-style': null, 'border-color': null },
              )
            }
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <LineStylePicker
            label="Style"
            value={(el.style.borderStyle as 'solid' | 'dashed' | 'dotted') || 'solid'}
            sampleWidth={num(el.style.borderWidth) || 2}
            onChange={(v) =>
              set(
                num(el.style.borderWidth) > 0
                  ? { 'border-style': v }
                  : // Picking a style before a width implies "give me a border".
                    { 'border-style': v, 'border-width': '2px' },
              )
            }
          />
        </div>
      </Group>
      <Group gap={6} grow>
        <NumberInput
          label="Padding"
          size="xs"
          min={0}
          max={200}
          value={num(el.style.padding)}
          onChange={(v) => typeof v === 'number' && set({ padding: v > 0 ? `${v}px` : null })}
        />
        <NumberInput
          label="Corner radius"
          size="xs"
          min={0}
          max={200}
          value={num(el.style.borderRadius)}
          onChange={(v) =>
            typeof v === 'number' && set({ 'border-radius': v > 0 ? `${v}px` : null })
          }
        />
      </Group>
    </>
  );
}

function ShapeFields({ el }: { el: HTMLElement }) {
  const ctx = useEditorStore((s) => s.ctx)!;
  const spec = readShapeSpec(el);
  if (!spec) return null;
  const hasFill = !isLineKind(spec.kind);
  const grow: React.CSSProperties = { flex: 1, minWidth: 0 };

  return (
    <>
      {/* Row 1: colors + stroke width + stroke style. */}
      <Group gap={6} align="flex-end" wrap="nowrap">
        {hasFill && (
          <ReColorInput
            key={`f-${spec.fill}`}
            label="Fill"
            defaultValue={spec.fill === 'none' ? '' : spec.fill}
            placeholder="none"
            onChangeEnd={(v) => writeShapeSpec(ctx, el, { fill: v || 'none' })}
          />
        )}
        <ReColorInput
          key={`s-${spec.stroke}`}
          label={hasFill ? 'Border' : 'Color'}
          defaultValue={spec.stroke === 'none' ? '' : spec.stroke}
          placeholder={hasFill ? 'none' : undefined}
          onChangeEnd={(v) => writeShapeSpec(ctx, el, { stroke: v || 'none' })}
        />
        <div style={grow}>
          <BorderWidthPicker
            label="Width"
            value={spec.strokeWidth}
            allowNone={hasFill}
            onChange={(v) => writeShapeSpec(ctx, el, { strokeWidth: v })}
          />
        </div>
        <div style={grow}>
          <LineStylePicker
            label="Style"
            value={spec.dash}
            sampleWidth={spec.strokeWidth}
            onChange={(v) => writeShapeSpec(ctx, el, { dash: v })}
          />
        </div>
      </Group>
      {/* Row 2 (fill shapes): radius + flips. */}
      {hasFill && (
        <Group gap={6} align="flex-end" wrap="nowrap">
          {(spec.kind === 'rect' || spec.kind === 'roundrect') && (
            <NumberInput
              label="Corner radius"
              size="xs"
              min={0}
              max={100}
              style={grow}
              value={spec.radius ?? (spec.kind === 'roundrect' ? 24 : 0)}
              onChange={(v) => typeof v === 'number' && writeShapeSpec(ctx, el, { radius: v })}
            />
          )}
          <Button
            size="compact-xs"
            mb={4}
            variant={spec.flipX ? 'filled' : 'default'}
            onClick={() => writeShapeSpec(ctx, el, { flipX: !spec.flipX || undefined })}
          >
            Flip H
          </Button>
          <Button
            size="compact-xs"
            mb={4}
            variant={spec.flipY ? 'filled' : 'default'}
            onClick={() => writeShapeSpec(ctx, el, { flipY: !spec.flipY || undefined })}
          >
            Flip V
          </Button>
        </Group>
      )}
      {/* Row 2 (connectors): routing + heads + snap gap in one line. */}
      {isLineKind(spec.kind) && (
        <Group gap={6} grow wrap="nowrap">
          <Select
            label="Route"
            size="xs"
            value={spec.route ?? 'straight'}
            data={[
              { value: 'straight', label: 'Straight' },
              { value: 'elbow', label: 'Elbow (right angles)' },
              { value: 'curve', label: 'Curved' },
            ]}
            onChange={(v) =>
              v &&
              writeShapeSpec(ctx, el, {
                route: v === 'straight' ? undefined : (v as 'elbow' | 'curve'),
              })
            }
          />
          <ArrowHeadsPicker
            label="Arrowheads"
            value={spec.heads ?? (spec.kind === 'arrow' ? 'end' : 'none')}
            onChange={(v) => writeShapeSpec(ctx, el, { heads: v as ArrowHeads })}
          />
          <Tooltip label="Endpoints stop this many px short of a snapped anchor">
            <NumberInput
              label="Snap gap"
              size="xs"
              min={0}
              max={60}
              value={spec.snapGap ?? 0}
              onChange={(v) =>
                typeof v === 'number' &&
                writeShapeSpec(ctx, el, { snapGap: v > 0 ? v : undefined })
              }
            />
          </Tooltip>
        </Group>
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
