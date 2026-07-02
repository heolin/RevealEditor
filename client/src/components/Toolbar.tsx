import { Fragment } from 'react';
import {
  ActionIcon,
  Button,
  Divider,
  Group,
  Text,
  Tooltip,
  useMantineColorScheme,
} from '@mantine/core';
import {
  IconChevronLeft,
  IconMoon,
  IconPlayerPlay,
  IconSun,
} from '@tabler/icons-react';
import { useDeckStore } from '../state/deckStore';
import { useEditorContext } from '../editor/actions/context';
import { resolveLayout } from '../editor/actions';
import { getLayout } from '../editor/actions/layouts';
import { ActionControl } from '../editor/actions/ActionControl';
import { InsertMenu } from '../editor/overlay/EditorOverlay';

export function Toolbar() {
  const meta = useDeckStore((s) => s.meta)!;
  const dirty = useDeckStore((s) => s.dirty);
  const saving = useDeckStore((s) => s.saving);
  const save = useDeckStore((s) => s.save);
  const close = useDeckStore((s) => s.close);
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();

  return (
    <div className="toolbar">
      <Group gap="xs" px="sm" py={4} wrap="nowrap">
        <Tooltip label="Back to presentations">
          <ActionIcon variant="subtle" color="gray" onClick={close}>
            <IconChevronLeft size={18} />
          </ActionIcon>
        </Tooltip>
        <Text fw={600} size="sm" truncate style={{ minWidth: 0 }}>
          {meta.title || meta.path}
        </Text>
        {dirty && <span className="dirty-dot" title="Unsaved changes" />}
        <div style={{ flex: 1 }} />
        <Tooltip label={`Switch editor to ${colorScheme === 'light' ? 'dark' : 'light'} mode`}>
          <ActionIcon variant="subtle" color="gray" onClick={toggleColorScheme}>
            {colorScheme === 'light' ? <IconMoon size={18} /> : <IconSun size={18} />}
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Open the real file — exactly what your audience sees">
          <Button
            size="xs"
            variant="default"
            leftSection={<IconPlayerPlay size={14} />}
            onClick={() => window.open(`/files/${meta.path}`, '_blank')}
          >
            Present
          </Button>
        </Tooltip>
        <Button size="xs" disabled={!dirty} loading={saving} onClick={() => void save()}>
          Save
        </Button>
      </Group>
      <FormatRibbon />
    </div>
  );
}

/**
 * The ribbon row. Actions HIDE when they don't apply (no disabled button
 * graveyards); during a text session the freed space hosts the full text
 * toolbar inline — one row, one home for text formatting.
 */
function FormatRibbon() {
  const ctx = useEditorContext();
  const groups = resolveLayout(getLayout('top'), ctx);
  const textGroups = ctx.session === 'text' ? resolveLayout(getLayout('textBar'), ctx) : [];
  return (
    <Group
      gap={4}
      px="sm"
      py={4}
      wrap="nowrap"
      className="ribbon"
      // Keep text sessions focused across any ribbon interaction.
      onMouseDown={(e) => ctx.session === 'text' && e.preventDefault()}
    >
      <InsertMenu />
      {groups.map((group, gi) => (
        <Fragment key={gi}>
          {gi > 0 && <Divider orientation="vertical" />}
          {group.map((action) => (
            <ActionControl key={action.id} action={action} ctx={ctx} variant="toolbar" />
          ))}
        </Fragment>
      ))}
      {textGroups.length > 0 && (
        <Group gap={4} wrap="nowrap" className="text-bar">
          {textGroups.map((group, gi) => (
            <Fragment key={gi}>
              <Divider orientation="vertical" />
              {group.map((action) => (
                <ActionControl key={action.id} action={action} ctx={ctx} variant="toolbar" />
              ))}
            </Fragment>
          ))}
        </Group>
      )}
    </Group>
  );
}
