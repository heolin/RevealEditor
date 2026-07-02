import { useEffect, useState, type FormEvent } from 'react';
import {
  ActionIcon,
  Alert,
  Button,
  Card,
  Container,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
  useMantineColorScheme,
} from '@mantine/core';
import { IconMoon, IconPlus, IconSun } from '@tabler/icons-react';
import { api, type DeckSummary } from '../api/client';
import { openDeck } from '../App';

export function DeckList() {
  const [decks, setDecks] = useState<DeckSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [themes, setThemes] = useState<string[]>([]);
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();

  useEffect(() => {
    api.listDecks().then(setDecks).catch((err) => setError(String(err)));
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
              <Text fw={600}>{d.title}</Text>
              <Text size="xs" c="dimmed">
                {d.path} · {d.slideCount} slides
              </Text>
            </Card>
          ))}
        </Stack>
      )}

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
