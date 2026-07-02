import { useEffect, useState, type FormEvent } from 'react';
import {
  ActionIcon,
  Alert,
  Button,
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
import { thumbDoc } from '../editor/stageDoc';
import { openDeck } from '../App';

/** Live first-slide miniature — the same shell the canvas/thumbnails use. */
function DeckPreview({ deck }: { deck: DeckSummary }) {
  const { preview } = deck;
  if (!preview.firstSlide) {
    return <div className="deck-preview deck-preview-empty">empty deck</div>;
  }
  const { width, height } = preview.config;
  return (
    <div className="deck-preview" style={{ aspectRatio: `${width} / ${height}` }}>
      <iframe
        title={deck.title}
        srcDoc={thumbDoc({ ...preview, path: deck.path }, preview.firstSlide)}
        tabIndex={-1}
        loading="lazy"
        style={{ width, height, border: 'none', pointerEvents: 'none', transformOrigin: 'top left' }}
        ref={(el) => {
          if (!el || !el.parentElement) return;
          const scale = el.parentElement.clientWidth / width;
          el.style.transform = `scale(${scale})`;
        }}
      />
    </div>
  );
}

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
    <Container size="xl" py={40}>
      <Group justify="space-between" mb="lg">
        <Title order={2}>RevealEditor</Title>
        <Tooltip label={`Switch to ${colorScheme === 'light' ? 'dark' : 'light'} mode`}>
          <ActionIcon variant="default" size="lg" onClick={toggleColorScheme}>
            {colorScheme === 'light' ? <IconMoon size={18} /> : <IconSun size={18} />}
          </ActionIcon>
        </Tooltip>
      </Group>

      {error && (
        <Alert color="red" mb="md" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {decks === null ? (
        <Text c="dimmed">Loading…</Text>
      ) : (
        <div className="deck-grid">
          <button className="deck-tile new-deck-tile" onClick={() => setCreating(true)}>
            <IconPlus size={28} />
            <Text size="sm" fw={600}>
              New presentation
            </Text>
          </button>
          {decks.map((d) => (
            <div key={d.path} className="deck-tile" onClick={() => void openDeck(d.path)}>
              <DeckPreview deck={d} />
              <div className="deck-tile-footer">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <Text size="sm" fw={600} truncate>
                    {d.title}
                  </Text>
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
                      Rename…
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
              </div>
            </div>
          ))}
        </div>
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
            const form = new FormData(e.currentTarget);
            const newTitle = String(form.get('newTitle') || '').trim();
            let newPath = String(form.get('newPath') || '').trim();
            if (newPath && !newPath.endsWith('.html')) newPath += '.html';
            try {
              // Title first (splices <title> in the file), then the file move.
              if (newTitle && newTitle !== renaming.title) {
                await api.saveDeck(renaming.path, { title: newTitle, baseMtime: renaming.mtime });
              }
              if (newPath && newPath !== renaming.path) {
                await api.renameDeck(renaming.path, newPath);
              }
              setRenaming(null);
              refresh();
            } catch (err) {
              setError(String(err));
            }
          }}
        >
          <Stack gap="sm">
            <TextInput
              name="newTitle"
              defaultValue={renaming?.title}
              data-autofocus
              label="Presentation title"
            />
            <TextInput name="newPath" defaultValue={renaming?.path} label="File name" />
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
