import { useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Modal, TextInput, Tooltip, UnstyledButton } from '@mantine/core';
import {
  IconAlertTriangle,
  IconArrowDown,
  IconArrowLeft,
  IconArrowRight,
  IconArrowUp,
  IconBolt,
  IconBook,
  IconBriefcase,
  IconBuilding,
  IconBulb,
  IconCalendar,
  IconChartBar,
  IconCheck,
  IconCircleCheck,
  IconCircleX,
  IconClock,
  IconCloud,
  IconCoin,
  IconDatabase,
  IconDeviceLaptop,
  IconFile,
  IconFlag,
  IconFolder,
  IconGift,
  IconGlobe,
  IconHeart,
  IconHome,
  IconInfoCircle,
  IconKey,
  IconLock,
  IconMail,
  IconMapPin,
  IconMessage,
  IconPhone,
  IconPuzzle,
  IconRocket,
  IconSearch,
  IconSettings,
  IconShield,
  IconShoppingCart,
  IconStar,
  IconTarget,
  IconThumbUp,
  IconTool,
  IconTrash,
  IconTrendingUp,
  IconTrophy,
  IconUser,
  IconUsers,
  IconWorld,
  IconX,
} from '@tabler/icons-react';
import { useEditorStore } from '../editor/editorStore';
import { insertHtmlSnippet } from '../editor/commands';

/**
 * Icon library (FEATURES §C): a curated tabler set inserted as INLINE SVG —
 * no font dependency, presents anywhere, strokes follow the theme text color
 * via currentColor. The svg element behaves like any sized media afterwards
 * (move/resize/rotate).
 */
const ICONS: Record<string, React.ComponentType<{ size?: number; stroke?: number }>> = {
  'alert-triangle': IconAlertTriangle,
  'arrow-down': IconArrowDown,
  'arrow-left': IconArrowLeft,
  'arrow-right': IconArrowRight,
  'arrow-up': IconArrowUp,
  bolt: IconBolt,
  book: IconBook,
  briefcase: IconBriefcase,
  building: IconBuilding,
  bulb: IconBulb,
  calendar: IconCalendar,
  'chart-bar': IconChartBar,
  check: IconCheck,
  'circle-check': IconCircleCheck,
  'circle-x': IconCircleX,
  clock: IconClock,
  cloud: IconCloud,
  coin: IconCoin,
  database: IconDatabase,
  laptop: IconDeviceLaptop,
  file: IconFile,
  flag: IconFlag,
  folder: IconFolder,
  gift: IconGift,
  globe: IconGlobe,
  heart: IconHeart,
  home: IconHome,
  'info-circle': IconInfoCircle,
  key: IconKey,
  lock: IconLock,
  mail: IconMail,
  'map-pin': IconMapPin,
  message: IconMessage,
  phone: IconPhone,
  puzzle: IconPuzzle,
  rocket: IconRocket,
  search: IconSearch,
  settings: IconSettings,
  shield: IconShield,
  cart: IconShoppingCart,
  star: IconStar,
  target: IconTarget,
  'thumb-up': IconThumbUp,
  tool: IconTool,
  trash: IconTrash,
  'trending-up': IconTrendingUp,
  trophy: IconTrophy,
  user: IconUser,
  users: IconUsers,
  world: IconWorld,
  x: IconX,
};

export function IconPicker() {
  const open = useEditorStore((s) => s.iconPickerOpen);
  const [query, setQuery] = useState('');
  if (!open) return null;
  const close = () => {
    useEditorStore.getState().setIconPickerOpen(false);
    setQuery('');
  };

  function insert(name: string) {
    const editor = useEditorStore.getState();
    if (!editor.ctx) return;
    const Icon = ICONS[name];
    // Static SVG markup, stroked with currentColor (theme text color);
    // inline style size is what the resize handles write afterwards.
    const svg = renderToStaticMarkup(<Icon size={96} stroke={1.5} />).replace(
      '<svg ',
      '<svg style="width: 96px; height: 96px;" ',
    );
    insertHtmlSnippet(editor.ctx, svg, editor.selectedEl);
    close();
  }

  const names = Object.keys(ICONS).filter((n) => n.includes(query.trim().toLowerCase()));

  return (
    <Modal opened onClose={close} title="Insert icon" size="34rem">
      <TextInput
        size="xs"
        mb="sm"
        placeholder="Search icons…"
        aria-label="Search icons"
        data-autofocus
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
      />
      <div className="icon-picker-grid">
        {names.map((name) => {
          const Icon = ICONS[name];
          return (
            <Tooltip key={name} label={name}>
              <UnstyledButton
                className="icon-picker-btn"
                aria-label={`Insert ${name} icon`}
                onClick={() => insert(name)}
              >
                <Icon size={26} stroke={1.5} />
              </UnstyledButton>
            </Tooltip>
          );
        })}
      </div>
    </Modal>
  );
}
