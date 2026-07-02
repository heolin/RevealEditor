import { useEffect, useState, type FormEvent } from 'react';
import { api, type DeckSummary } from '../api/client';
import { useUiTheme } from '../state/uiTheme';
import { openDeck } from '../App';

export function DeckList() {
  const [decks, setDecks] = useState<DeckSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [themes, setThemes] = useState<string[]>([]);
  const [uiTheme, toggleUiTheme] = useUiTheme();

  async function refresh() {
    try {
      setDecks(await api.listDecks());
    } catch (err) {
      setError(String(err));
    }
  }

  useEffect(() => {
    void refresh();
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
    <div className="deck-list-page">
      <header>
        <h1>RevealEditor</h1>
        <div className="header-actions">
          <button
            onClick={toggleUiTheme}
            title={`Switch editor to ${uiTheme === 'light' ? 'dark' : 'light'} mode`}
          >
            {uiTheme === 'light' ? '🌙' : '☀️'}
          </button>
          <button className="primary" onClick={() => setCreating(true)}>
            New presentation
          </button>
        </div>
      </header>
      {error && <div className="error-banner">{error}</div>}
      {decks === null ? (
        <p className="muted">Loading…</p>
      ) : decks.length === 0 ? (
        <p className="muted">No reveal.js presentations found in this workspace yet.</p>
      ) : (
        <ul className="deck-list">
          {decks.map((d) => (
            <li key={d.path}>
              <button className="deck-item" onClick={() => void openDeck(d.path)}>
                <span className="deck-title">{d.title}</span>
                <span className="deck-meta">
                  {d.path} · {d.slideCount} slides
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {creating && (
        <div className="modal-backdrop" onClick={() => setCreating(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={onCreate}>
            <h2>New presentation</h2>
            <label>
              Title
              <input name="title" defaultValue="New presentation" autoFocus />
            </label>
            <label>
              File name (optional)
              <input name="path" placeholder="my-talk.html" />
            </label>
            <label>
              Theme
              <select name="theme" defaultValue="black">
                {(themes.length ? themes : ['black']).map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <div className="modal-actions">
              <button type="button" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button type="submit" className="primary">
                Create
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
