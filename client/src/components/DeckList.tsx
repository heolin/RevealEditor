import { useEffect, useState, type FormEvent } from 'react';
import {
  ActionIcon,
  Alert,
  Button,
  Card,
  Container,
  Group,
  Menu,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
  useMantineColorScheme,
} from '@mantine/core';
import {
  IconCopy,
  IconDots,
  IconMoon,
  IconPencil,
  IconPlus,
  IconSun,
  IconTrash,
} from '@tabler/icons-react';
import { api, type DeckSummary } from '../api/client';
import { openDeck } from '../App';

export function DeckList() {
  const [decks, setDecks] = useState<DeckSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<DeckSummary | null>(null);
  const [deleting, setDeleting] = useState<DeckSummary | null>(null);
  const [themes, setThemes] = useState<string[]>([]);
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();

  function refresh() {
    api.listDecks().then(setDecks).catch((err) => setError(String(err)));
  }

  useEffect(() => {
    refresh();
    api.listThemes().then(setThemes).catch(() => setThemes(['black', 'white']));
  }, []);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const title = String(form.get('title') || 'New presentation');
    let path = String(form.get('path') || '').trim();
    if (!path) path = `${title.toLowerCase().replace(/[^\w]+/g, '-')}.html`;
    if (!path.endsWith('.html')) path += '.html';
    try {
      await api.createDeck(path, title, String(form.get('theme') || 'black'));
      setCreating(false);
      await openDeck(path);
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <Container size="sm" py={48}>
      <Group justify="space-between" mb="lg">
        <Title order={2}>RevealEditor</Title>
        <Group gap="xs">
          <Tooltip label={`Switch to ${colorScheme === 'light' ? 'dark' : 'light'} mode`}>
            <ActionIcon variant="default" size="lg" onClick={toggleColorScheme}>
              {colorScheme === 'light' ? <IconMoon size={18} /> : <IconSun size={18} />}
            </ActionIcon>
          </Tooltip>
          <Button leftSection={<IconPlus size={16} />} onClick={() => setCreating(true)}>
            New presentation
          </Button>
        </Group>
      </Group>

      {error && (
        <Alert color="red" mb="md" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {decks === null ? (
        <Text c="dimmed">Loading…</Text>
      ) : decks.length === 0 ? (
        <Text c="dimmed">No reveal.js presentations found in this workspace yet.</Text>
      ) : (
        <Stack gap="xs">
          {decks.map((d) => (
            <Card
              key={d.path}
              withBorder
              padding="md"
              className="deck-item"
              onClick={() => void openDeck(d.path)}
            >
              <Group justify="space-between" wrap="nowrap">
                <div style={{ minWidth: 0 }}>
                  <Text fw={600}>{d.title}</Text>
                  <Text size="xs" c="dimmed" truncate>
                    {d.path} · {d.slideCount} slides
                  </Text>
                </div>
                <Menu withinPortal position="bottom-end">
                  <Menu.Target>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <IconDots size={16} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
                    <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => setRenaming(d)}>
                      Rename file…
                    </Menu.Item>
                    <Menu.Item
                      leftSection={<IconCopy size={14} />}
                      onClick={async () => {
                        try {
                          await api.duplicateDeck(d.path);
                          refresh();
                        } catch (err) {
                          setError(String(err));
                        }
                      }}
                    >
                      Duplicate
                    </Menu.Item>
                    <Menu.Divider />
                    <Menu.Item
                      color="red"
                      leftSection={<IconTrash size={14} />}
                      onClick={() => setDeleting(d)}
                    >
                      Delete…
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Group>
            </Card>
          ))}
        </Stack>
      )}

      <Modal
        opened={renaming !== null}
        onClose={() => setRenaming(null)}
        title={`Rename ${renaming?.path ?? ''}`}
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!renaming) return;
            const newPath = String(new FormData(e.currentTarget).get('newPath') || '').trim();
            if (!newPath || newPath === renaming.path) return setRenaming(null);
            try {
              await api.renameDeck(renaming.path, newPath.endsWith('.html') ? newPath : `${newPath}.html`);
              setRenaming(null);
              refresh();
            } catch (err) {
              setError(String(err));
            }
          }}
        >
          <Stack gap="sm">
            <TextInput name="newPath" defaultValue={renaming?.path} data-autofocus label="New file name" />
            <Text size="xs" c="dimmed">
              Renaming within the same folder keeps relative asset links working.
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setRenaming(null)}>
                Cancel
              </Button>
              <Button type="submit">Rename</Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal opened={deleting !== null} onClose={() => setDeleting(null)} title="Delete presentation">
        <Stack gap="sm">
          <Text size="sm">
            Delete <b>{deleting?.title}</b> ({deleting?.path})? The file is removed from disk.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              color="red"
              onClick={async () => {
                if (!deleting) return;
                try {
                  await api.deleteDeck(deleting.path);
                  setDeleting(null);
                  refresh();
                } catch (err) {
                  setError(String(err));
                }
              }}
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={creating} onClose={() => setCreating(false)} title="New presentation">
        <form onSubmit={onCreate}>
          <Stack gap="sm">
            <TextInput label="Title" name="title" defaultValue="New presentation" data-autofocus />
            <TextInput label="File name (optional)" name="path" placeholder="my-talk.html" />
            <Select
              label="Theme"
              name="theme"
              defaultValue="black"
              data={themes.length ? themes : ['black']}
              searchable
            />
            <Group justify="flex-end" mt="xs">
              <Button variant="default" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button type="submit">Create</Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Container>
  );
}
