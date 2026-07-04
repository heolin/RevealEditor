/**
 * Shared style pickers used by the inspector and toolbars:
 *  - BorderWidthPicker / LineStylePicker — dropdowns whose options are drawn,
 *    not written (a line sample of the actual width/style).
 *  - ReColorInput — color input with a swatch palette: presets, colors
 *    harvested from the open deck, and user-saved custom slots.
 */
import { useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  Button,
  ColorPicker,
  Group,
  Menu,
  Popover,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { IconBookmarkPlus } from '@tabler/icons-react';
import { useDeckStore } from '../state/deckStore';
import { deckColorSlots, saveDeckColorSlot } from '../editor/managedCss';

/* ---------- border width ---------- */

/** The 8 supported border/stroke widths. */
export const BORDER_WIDTHS = [1, 2, 3, 4, 8, 12, 16, 24];

export type LineStyle = 'solid' | 'dashed' | 'dotted';
const LINE_STYLES: LineStyle[] = ['solid', 'dashed', 'dotted'];

function LineSample({ width, style }: { width: number; style: LineStyle }) {
  return (
    <div
      className="line-sample"
      style={{ borderTop: `${width}px ${style} currentColor` }}
      aria-hidden
    />
  );
}

export function BorderWidthPicker({
  label,
  value,
  allowNone,
  onChange,
}: {
  label: string;
  value: number;
  /** Offer a 0 / "None" option (fills can be borderless; lines cannot). */
  allowNone?: boolean;
  onChange(v: number): void;
}) {
  const options = allowNone ? [0, ...BORDER_WIDTHS] : BORDER_WIDTHS;
  return (
    <div>
      <Text size="xs" fw={500} mb={2}>
        {label}
      </Text>
      <Menu withinPortal position="bottom-start" width={160}>
        <Menu.Target>
          <UnstyledButton className="line-picker-target" aria-label={label}>
            {value > 0 ? (
              <>
                <LineSample width={Math.min(value, 16)} style="solid" />
                <Text size="xs">{value}px</Text>
              </>
            ) : (
              <Text size="xs" c="dimmed">
                None
              </Text>
            )}
          </UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown>
          {options.map((w) => (
            <Menu.Item
              key={w}
              onClick={() => onChange(w)}
              rightSection={
                <Text size="xs" c="dimmed" w={34} ta="right">
                  {w > 0 ? `${w}px` : 'none'}
                </Text>
              }
            >
              {w > 0 ? <LineSample width={w} style="solid" /> : <div className="line-sample" />}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    </div>
  );
}

/* ---------- line / border style ---------- */

export function LineStylePicker({
  label,
  value,
  onChange,
  sampleWidth = 3,
}: {
  label: string;
  value: LineStyle;
  onChange(v: LineStyle): void;
  /** Draw samples near the real stroke width so dashes read true to size. */
  sampleWidth?: number;
}) {
  const w = Math.max(2, Math.min(sampleWidth, 8));
  return (
    <div>
      <Text size="xs" fw={500} mb={2}>
        {label}
      </Text>
      <Menu withinPortal position="bottom-start" width={140}>
        <Menu.Target>
          <UnstyledButton className="line-picker-target" aria-label={label}>
            <LineSample width={w} style={value} />
          </UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown>
          {LINE_STYLES.map((style) => (
            <Menu.Item key={style} aria-label={style} onClick={() => onChange(style)}>
              <LineSample width={w} style={style} />
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    </div>
  );
}

/* ---------- arrowheads ---------- */

export type ArrowHeadsValue = 'none' | 'start' | 'end' | 'both';
const HEADS: ArrowHeadsValue[] = ['none', 'end', 'start', 'both'];

function HeadsSample({ heads }: { heads: ArrowHeadsValue }) {
  const startHead = heads === 'start' || heads === 'both';
  const endHead = heads === 'end' || heads === 'both';
  return (
    <svg width="48" height="12" viewBox="0 0 48 12" aria-hidden>
      <line
        x1={startHead ? 9 : 3}
        y1="6"
        x2={endHead ? 39 : 45}
        y2="6"
        stroke="currentColor"
        strokeWidth="2"
      />
      {startHead && <path d="M2 6 L11 1.5 L11 10.5 Z" fill="currentColor" />}
      {endHead && <path d="M46 6 L37 1.5 L37 10.5 Z" fill="currentColor" />}
    </svg>
  );
}

/** Arrowhead placement, drawn — a line with heads at none/end/start/both. */
export function ArrowHeadsPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ArrowHeadsValue;
  onChange(v: ArrowHeadsValue): void;
}) {
  return (
    <div>
      <Text size="xs" fw={500} mb={2}>
        {label}
      </Text>
      <Menu withinPortal position="bottom-start" width={110}>
        <Menu.Target>
          <UnstyledButton className="line-picker-target" aria-label={label}>
            <HeadsSample heads={value} />
          </UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown>
          {HEADS.map((heads) => (
            <Menu.Item key={heads} aria-label={heads} onClick={() => onChange(heads)}>
              <HeadsSample heads={heads} />
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    </div>
  );
}

/* ---------- color input with palette ---------- */

/** Predefined palette: neutrals + a usable hue wheel (incl. the shape blue). */
const PRESET_COLORS = [
  '#000000',
  '#4a4a4a',
  '#9b9b9b',
  '#d9d9d9',
  '#ffffff',
  '#e03131',
  '#e8590c',
  '#f5b301',
  '#2f9e44',
  '#0ca678',
  '#2a78d6',
  '#3b5bdb',
  '#7048e8',
  '#c2255c',
];

// Saved slots live IN THE DECK (managed CSS custom property) — they travel
// with the file to any machine, unlike localStorage.

/** Colors already used in the open deck — its slides and managed/head CSS. */
function useDeckColors(): string[] {
  const columns = useDeckStore((s) => s.columns);
  const meta = useDeckStore((s) => s.meta);
  return useMemo(() => {
    const found = new Set<string>();
    const scan = (text: string) => {
      for (const m of text.matchAll(/#[0-9a-f]{3,8}\b|rgba?\([\d ,./%]+\)/gi)) {
        found.add(m[0].toLowerCase());
      }
    };
    for (const col of columns) for (const slide of col.slides) scan(slide.source);
    if (meta) {
      scan(meta.managedCss);
      for (const css of meta.headStyles) scan(css);
    }
    return [...found].filter((c) => !PRESET_COLORS.includes(c)).slice(0, 14);
  }, [columns, meta]);
}

interface ReColorInputProps {
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  disabled?: boolean;
  w?: number | string;
  'aria-label'?: string;
  onChangeEnd(value: string): void;
}

/**
 * The editor's color control: a color CIRCLE (no rgb/hex text in the
 * trigger) opening a popover with the picker, the swatch palette (presets,
 * then colors found in this deck, then the user's saved slots), a hex field
 * for precision, and a bookmark that saves into the custom slots.
 */
export function ReColorInput({
  label,
  defaultValue,
  placeholder,
  disabled,
  onChangeEnd,
  'aria-label': ariaLabel,
}: ReColorInputProps) {
  const deckColors = useDeckColors();
  const [custom, setCustom] = useState<string[]>(deckColorSlots);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string>(String(defaultValue ?? ''));
  const committed = useRef(String(defaultValue ?? ''));
  const swatches = [...PRESET_COLORS, ...deckColors, ...custom];

  const commit = (v: string) => {
    if (v === committed.current) return;
    committed.current = v;
    onChangeEnd(v);
  };

  return (
    <div>
      {label && (
        <Text size="xs" fw={500} mb={2}>
          {label}
        </Text>
      )}
      <Popover
        opened={open}
        onChange={(o) => {
          setOpen(o);
          if (!o) commit(value); // closing commits whatever is picked
        }}
        withinPortal
        position="bottom-start"
        shadow="md"
      >
        <Popover.Target>
          <UnstyledButton
            className="color-circle-btn"
            aria-label={ariaLabel ?? label ?? 'Color'}
            title={value || placeholder}
            disabled={disabled}
            onClick={() => setOpen((o) => !o)}
          >
            <span
              className="color-circle"
              data-empty={!value || undefined}
              style={value ? { background: value } : undefined}
            />
          </UnstyledButton>
        </Popover.Target>
        <Popover.Dropdown p={8}>
          <ColorPicker
            format="hex"
            value={value}
            swatches={swatches}
            swatchesPerRow={7}
            onChange={setValue}
            onChangeEnd={(v) => {
              setValue(v);
              commit(v);
            }}
          />
          <Group mt={6} gap={4} wrap="nowrap">
            <TextInput
              size="xs"
              value={value}
              placeholder={placeholder ?? 'none'}
              aria-label={`${ariaLabel ?? label ?? 'Color'} value`}
              onChange={(e) => setValue(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  commit(value);
                  setOpen(false);
                }
              }}
              style={{ flex: 1 }}
            />
            <Tooltip label="Save into this deck\u2019s colors">
              <ActionIcon
                size="sm"
                variant="subtle"
                color="gray"
                aria-label="Save into this deck's colors"
                onClick={() => value && setCustom(saveDeckColorSlot(value))}
              >
                <IconBookmarkPlus size={14} />
              </ActionIcon>
            </Tooltip>
            <Button
              size="compact-xs"
              variant="subtle"
              color="gray"
              onClick={() => {
                setValue('');
                commit('');
                setOpen(false);
              }}
            >
              Clear
            </Button>
          </Group>
        </Popover.Dropdown>
      </Popover>
    </div>
  );
}
