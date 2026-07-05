import { useRef, useState } from 'react';
import { ActionIcon, Divider, Group, Menu, Popover, TextInput, Tooltip } from '@mantine/core';
import { IconLink, IconLinkOff, IconMoodSmile, IconPhoto, IconTriangleSquareCircle } from '@tabler/icons-react';
import type { EditorContext, SurfaceVariant } from './types';
import { linkAtSelection, removeLink, setLink, insertHtmlSnippet } from '../commands';
import { useEditorStore } from '../editorStore';
import { defaultShapeSpec, shapeInnerSvg, type ShapeKind } from '../shapes';
import { api } from '../../api/client';

/**
 * Menu icon drawn by the REAL shape renderer (outline style at icon scale) —
 * the gallery shows exactly the geometry that will be inserted.
 */
export function ShapePreview({ kind, size = 26 }: { kind: ShapeKind; size?: number | string }) {
  const spec = { ...defaultShapeSpec(kind), fill: 'none', stroke: 'currentColor', strokeWidth: 2 };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 30 22"
      preserveAspectRatio="xMidYMid meet"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: shapeInnerSvg(spec, 30, 22) }}
    />
  );
}

const previewIcon =
  (kind: ShapeKind) =>
  ({ size }: { size?: number | string }) => <ShapePreview kind={kind} size={size} />;

/** Kind → icon/title, shared by the insert actions and the shapes gallery. */
export const SHAPE_META: Record<
  ShapeKind,
  { icon: React.ComponentType<{ size?: number | string }>; title: string }
> = Object.fromEntries(
  Object.entries({
    rect: 'Rectangle',
    roundrect: 'Rounded rectangle',
    ellipse: 'Oval',
    triangle: 'Triangle',
    righttriangle: 'Right triangle',
    parallelogram: 'Parallelogram',
    trapezoid: 'Trapezoid',
    diamond: 'Diamond',
    pentagon: 'Pentagon',
    hexagon: 'Hexagon',
    chevron: 'Chevron',
    star: 'Star',
    callout: 'Callout',
    line: 'Line',
    arrow: 'Arrow',
    stadium: 'Terminator',
    cylinder: 'Database',
    predefined: 'Predefined process',
    document: 'Document',
    multidocument: 'Multiple documents',
    onpage: 'On-page connector',
    offpage: 'Off-page connector',
    manualop: 'Manual operation',
    manualinput: 'Manual input',
    display: 'Display',
    merge: 'Merge',
    collate: 'Collate',
    sort: 'Sort',
    delay: 'Delay',
    internalstorage: 'Internal storage',
    seqstorage: 'Sequential access storage',
    directstorage: 'Direct access storage',
    card: 'Card',
    papertape: 'Paper tape',
    summing: 'Summing junction',
    orjunction: 'Or junction',
  } satisfies Record<ShapeKind, string>).map(([kind, title]) => [
    kind,
    { icon: previewIcon(kind as ShapeKind), title },
  ]),
) as Record<ShapeKind, { icon: React.ComponentType<{ size?: number | string }>; title: string }>;

/** Gallery entries: a kind plus (optionally) a flowchart-semantic label that
 *  differs from the kind's base title. */
type GalleryEntry = { kind: ShapeKind; title?: string };

const BASE_SHAPES: GalleryEntry[] = [
  { kind: 'rect' },
  { kind: 'roundrect' },
  { kind: 'ellipse' },
  { kind: 'triangle' },
  { kind: 'righttriangle' },
  { kind: 'parallelogram' },
  { kind: 'trapezoid' },
  { kind: 'diamond' },
  { kind: 'pentagon' },
  { kind: 'hexagon' },
  { kind: 'chevron' },
  { kind: 'star' },
  { kind: 'callout' },
];

const FLOWCHART_SHAPES: GalleryEntry[] = [
  { kind: 'stadium' },
  { kind: 'cylinder' },
  { kind: 'predefined' },
  { kind: 'document' },
  { kind: 'multidocument' },
  { kind: 'onpage' },
  { kind: 'offpage' },
  { kind: 'manualop' },
  { kind: 'manualinput' },
  { kind: 'display' },
  { kind: 'hexagon', title: 'Preparation' },
  { kind: 'merge' },
  { kind: 'triangle', title: 'Extract' },
  { kind: 'collate' },
  { kind: 'sort' },
  { kind: 'delay' },
  { kind: 'internalstorage' },
  { kind: 'seqstorage' },
  { kind: 'directstorage' },
  { kind: 'card' },
  { kind: 'papertape' },
  { kind: 'summing' },
  { kind: 'orjunction' },
];

/**
 * The Shapes gallery (Google Slides-style): one ribbon button opening a grid
 * of shape buttons — base shapes, divider, flowchart shapes. Every button's
 * icon comes from the shape renderer itself.
 */
export function ShapeMenuControl({ ctx, variant }: { ctx: EditorContext; variant: SurfaceVariant }) {
  const [open, setOpen] = useState(false);
  if (!ctx.stage || variant === 'menu') return null;
  const stage = ctx.stage;

  const grid = (entries: GalleryEntry[]) => (
    <div className="shapes-grid">
      {entries.map(({ kind, title }) => (
        <Tooltip key={title ?? kind} label={title ?? SHAPE_META[kind].title}>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="lg"
            aria-label={title ?? SHAPE_META[kind].title}
            onClick={() => {
              useEditorStore.getState().setPendingShapeKind(kind);
              setOpen(false);
            }}
          >
            <ShapePreview kind={kind} size={24} />
          </ActionIcon>
        </Tooltip>
      ))}
    </div>
  );

  return (
    <Popover opened={open} onChange={setOpen} position="bottom-start" withinPortal shadow="md">
      <Popover.Target>
        <Tooltip label="Shapes">
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label="Shapes"
            onClick={() => setOpen((o) => !o)}
          >
            <IconTriangleSquareCircle size={16} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown p={8}>
        {grid(BASE_SHAPES)}
        <Divider my={6} />
        {grid(FLOWCHART_SHAPES)}
      </Popover.Dropdown>
    </Popover>
  );
}

/** Link popover — the one format control that needs its own input UI. */
export function LinkControl({ ctx, variant }: { ctx: EditorContext; variant: SurfaceVariant }) {
  const [open, setOpen] = useState(false);
  const [href, setHref] = useState('');
  if (!ctx.stage) return null;
  const stage = ctx.stage;

  const target = (
    <Tooltip label="Link">
      <ActionIcon
        variant="subtle"
        color="gray"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          setHref(linkAtSelection(stage)?.getAttribute('href') ?? '');
          setOpen((o) => !o);
        }}
      >
        <IconLink size={16} />
      </ActionIcon>
    </Tooltip>
  );
  if (variant === 'menu') return null; // links only make sense with a live text selection

  return (
    <Popover opened={open} onChange={setOpen} position="bottom" withinPortal trapFocus={false}>
      <Popover.Target>{target}</Popover.Target>
      <Popover.Dropdown onMouseDown={(e) => e.stopPropagation()}>
        <Group gap={4}>
          <TextInput
            size="xs"
            w={220}
            placeholder="https://…"
            value={href}
            onChange={(e) => setHref(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && href) {
                setLink(stage, href);
                setOpen(false);
              }
            }}
          />
          <ActionIcon
            variant="filled"
            disabled={!href}
            onClick={() => {
              setLink(stage, href);
              setOpen(false);
            }}
          >
            <IconLink size={14} />
          </ActionIcon>
          <Tooltip label="Remove link">
            <ActionIcon
              variant="default"
              onClick={() => {
                removeLink(stage);
                setOpen(false);
              }}
            >
              <IconLinkOff size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Popover.Dropdown>
    </Popover>
  );
}

/** Curated emoji set: name → char, filterable by name. */
const EMOJI: [string, string][] = [
  ['smile', '😄'], ['grin', '😁'], ['laugh', '😂'], ['wink', '😉'], ['heart eyes', '😍'],
  ['cool', '😎'], ['thinking', '🤔'], ['neutral', '😐'], ['worried', '😟'], ['sad', '😢'],
  ['angry', '😠'], ['mind blown', '🤯'], ['party', '🥳'], ['sleeping', '😴'], ['nerd', '🤓'],
  ['thumbs up', '👍'], ['thumbs down', '👎'], ['clap', '👏'], ['wave', '👋'], ['ok hand', '👌'],
  ['point right', '👉'], ['point left', '👈'], ['muscle', '💪'], ['pray', '🙏'], ['handshake', '🤝'],
  ['heart', '❤️'], ['star', '⭐'], ['sparkles', '✨'], ['fire', '🔥'], ['boom', '💥'],
  ['check', '✅'], ['cross', '❌'], ['warning', '⚠️'], ['question', '❓'], ['exclamation', '❗'],
  ['idea bulb', '💡'], ['rocket', '🚀'], ['target', '🎯'], ['trophy', '🏆'], ['medal', '🥇'],
  ['chart up', '📈'], ['chart down', '📉'], ['bar chart', '📊'], ['money', '💰'], ['gem', '💎'],
  ['calendar', '📅'], ['clock', '🕐'], ['hourglass', '⏳'], ['pin', '📌'], ['paperclip', '📎'],
  ['folder', '📁'], ['document', '📄'], ['clipboard', '📋'], ['book', '📚'], ['pencil', '✏️'],
  ['mail', '📧'], ['phone', '📱'], ['computer', '💻'], ['gear', '⚙️'], ['wrench', '🔧'],
  ['lock', '🔒'], ['key', '🔑'], ['magnifier', '🔍'], ['bell', '🔔'], ['megaphone', '📣'],
  ['globe', '🌍'], ['sun', '☀️'], ['moon', '🌙'], ['cloud', '☁️'], ['rainbow', '🌈'],
  ['tree', '🌳'], ['flower', '🌸'], ['coffee', '☕'], ['pizza', '🍕'], ['cake', '🎂'],
  ['gift', '🎁'], ['balloon', '🎈'], ['flag', '🚩'], ['car', '🚗'], ['plane', '✈️'],
  ['house', '🏠'], ['office', '🏢'], ['dog', '🐶'], ['cat', '🐱'], ['bug', '🐛'],
  ['arrow right', '➡️'], ['arrow left', '⬅️'], ['arrow up', '⬆️'], ['arrow down', '⬇️'],
  ['recycle', '♻️'], ['infinity', '♾️'], ['plus', '➕'], ['minus', '➖'], ['hundred', '💯'],
];

/** Emoji popover for text sessions — inserts at the caret. */
export function EmojiControl({ ctx, variant }: { ctx: EditorContext; variant: SurfaceVariant }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  if (!ctx.stage || variant === 'menu') return null;
  const stage = ctx.stage;
  const matches = EMOJI.filter(([name]) => name.includes(q.trim().toLowerCase()));

  return (
    <Popover opened={open} onChange={setOpen} position="bottom" withinPortal trapFocus={false}>
      <Popover.Target>
        <Tooltip label="Emoji">
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label="Emoji"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setOpen((o) => !o)}
          >
            <IconMoodSmile size={16} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown p={8} onMouseDown={(e) => e.preventDefault()}>
        <TextInput
          size="xs"
          mb={6}
          placeholder="Search emoji…"
          aria-label="Search emoji"
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
        />
        <div className="emoji-grid">
          {matches.map(([name, char]) => (
            <button
              key={name}
              type="button"
              className="emoji-btn"
              title={name}
              onMouseDown={(e) => e.preventDefault()} // keep the session's caret
              onClick={() => {
                stage.doc.execCommand('insertText', false, char);
                setOpen(false);
              }}
            >
              {char}
            </button>
          ))}
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}

/**
 * Sanitise an uploaded SVG for inline insertion: drop <script>, event-handler
 * attributes, and external/js references, keeping the vector markup (which
 * stays CSS-targetable, unlike an <img>). Returns null if it isn't valid SVG.
 */
function sanitizeSvg(text: string): string | null {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!svg || doc.querySelector('parsererror')) return null;
  for (const el of svg.querySelectorAll('script, foreignObject')) el.remove();
  for (const el of [svg, ...svg.querySelectorAll('*')]) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      const val = attr.value.trim().toLowerCase();
      if (name.startsWith('on')) el.removeAttribute(attr.name);
      else if (
        (name === 'href' || name === 'xlink:href') &&
        !val.startsWith('#') &&
        !val.startsWith('data:image')
      )
        el.removeAttribute(attr.name);
    }
  }
  return svg.outerHTML;
}

/** Image insertion — needs a hidden file input for uploads. */
export function ImageInsertControl({ ctx, variant }: { ctx: EditorContext; variant: SurfaceVariant }) {
  const fileRef = useRef<HTMLInputElement>(null);
  if (!ctx.stage || !ctx.deck) return null;
  const stage = ctx.stage;
  const deckPath = ctx.deck.path;
  const after = ctx.selection;

  const input = (
    <input
      ref={fileRef}
      type="file"
      accept="image/*"
      hidden
      onChange={async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        // SVG → inline vector markup (CSS-targetable); everything else → <img>.
        if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
          const svg = sanitizeSvg(await file.text());
          if (svg) {
            insertHtmlSnippet(stage, svg, after);
            e.target.value = '';
            return;
          }
        }
        const { url } = await api.uploadAsset(deckPath, file);
        insertHtmlSnippet(stage, `<img src="${url}" alt="">`, after);
        e.target.value = '';
      }}
    />
  );

  if (variant === 'menu') {
    return (
      <>
        <Menu.Item leftSection={<IconPhoto size={14} />} onClick={() => fileRef.current?.click()}>
          Image…
        </Menu.Item>
        {input}
      </>
    );
  }
  return (
    <>
      <Tooltip label="Insert image">
        <ActionIcon variant="subtle" color="gray" onClick={() => fileRef.current?.click()}>
          <IconPhoto size={16} />
        </ActionIcon>
      </Tooltip>
      {input}
    </>
  );
}
