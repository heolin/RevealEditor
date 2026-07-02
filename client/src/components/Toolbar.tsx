import { useEffect, useState } from 'react';
import {
  ActionIcon,
  Button,
  Group,
  Select,
  Text,
  Tooltip,
  useMantineColorScheme,
} from '@mantine/core';
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconChevronLeft,
  IconMoon,
  IconPlayerPlay,
  IconSun,
} from '@tabler/icons-react';
import { useDeckStore } from '../state/deckStore';
import { useEditorStore } from '../editor/editorStore';
import { InsertMenu } from '../editor/overlay/EditorOverlay';
import { api } from '../api/client';

export function Toolbar() {
  const meta = useDeckStore((s) => s.meta)!;
  const dirty = useDeckStore((s) => s.dirty);
  const saving = useDeckStore((s) => s.saving);
  const save = useDeckStore((s) => s.save);
  const close = useDeckStore((s) => s.close);
  const setTheme = useDeckStore((s) => s.setTheme);
  const [themes, setThemes] = useState<string[]>([]);
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();

  useEffect(() => {
    api.listThemes().then(setThemes).catch(() => setThemes([]));
  }, []);

  return (
    <Group gap="xs" px="sm" py={6} className="toolbar" wrap="nowrap">
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
      <Tooltip label="Undo (Ctrl+Z)">
        <ActionIcon
          variant="subtle"
          color="gray"
          onClick={() => useDeckStore.temporal.getState().undo()}
        >
          <IconArrowBackUp size={18} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Redo (Ctrl+Y)">
        <ActionIcon
          variant="subtle"
          color="gray"
          onClick={() => useDeckStore.temporal.getState().redo()}
        >
          <IconArrowForwardUp size={18} />
        </ActionIcon>
      </Tooltip>
      <ToolbarInsert />
      {themes.length > 0 &&
        (meta.theme === null ? (
          <Tooltip label="This deck uses its own custom styling — there is no standard theme link to switch">
            <Select size="xs" w={150} placeholder="custom styling" data={[]} disabled />
          </Tooltip>
        ) : (
          <Select
            size="xs"
            w={150}
            value={meta.theme}
            data={themes}
            onChange={(v) => v && setTheme(v)}
            searchable
            comboboxProps={{ withinPortal: true }}
          />
        ))}
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
  );
}

/** Insert menu in the main toolbar — appends after the current selection. */
function ToolbarInsert() {
  const selectedEl = useEditorStore((s) => s.selectedEl);
  return <InsertMenu after={selectedEl} />;
}
