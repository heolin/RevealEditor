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
import { getAction } from '../editor/actions';
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
 * The ribbon-lite row: TOP_LAYOUT rendered in full — actions that don't apply
 * to the current selection are DISABLED, not hidden, so the panel is stable
 * (PowerPoint behavior). See docs/TOOLBARS.md.
 */
function FormatRibbon() {
  const ctx = useEditorContext();
  return (
    <Group gap={4} px="sm" py={4} wrap="nowrap" className="ribbon">
      <InsertMenu />
      {getLayout('top').map((group, gi) => {
        const actions = group
          .map(getAction)
          .filter((a): a is NonNullable<typeof a> => a !== null);
        if (actions.length === 0) return null;
        return (
          <Fragment key={gi}>
            {gi > 0 && <Divider orientation="vertical" />}
            {actions.map((action) =>
              action.when(ctx) || action.kind !== 'custom' ? (
                <ActionControl key={action.id} action={action} ctx={ctx} variant="toolbar" />
              ) : null,
            )}
          </Fragment>
        );
      })}
    </Group>
  );
}
