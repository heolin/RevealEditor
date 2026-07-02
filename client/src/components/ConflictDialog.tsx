import { Button, Code, Group, Modal, Stack, Text } from '@mantine/core';
import { useDeckStore } from '../state/deckStore';
import { api } from '../api/client';

export function ConflictDialog() {
  const meta = useDeckStore((s) => s.meta)!;
  const save = useDeckStore((s) => s.save);
  const dismiss = useDeckStore((s) => s.dismissConflict);
  const load = useDeckStore((s) => s.load);

  async function reload() {
    const deck = await api.getDeck(meta.path);
    load(deck);
  }

  return (
    <Modal opened onClose={dismiss} title="File changed on disk">
      <Stack gap="sm">
        <Text size="sm">
          <Code>{meta.path}</Code> was modified outside the editor since you opened it.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => void reload()}>
            Reload from disk
          </Button>
          <Button color="red" onClick={() => void save({ force: true })}>
            Overwrite file
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
