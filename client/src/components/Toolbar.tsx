import { useEffect, useState } from 'react';
import { useDeckStore } from '../state/deckStore';
import { useUiTheme } from '../state/uiTheme';
import { api } from '../api/client';

export function Toolbar() {
  const meta = useDeckStore((s) => s.meta)!;
  const dirty = useDeckStore((s) => s.dirty);
  const saving = useDeckStore((s) => s.saving);
  const save = useDeckStore((s) => s.save);
  const close = useDeckStore((s) => s.close);
  const setTheme = useDeckStore((s) => s.setTheme);
  const [themes, setThemes] = useState<string[]>([]);
  const [uiTheme, toggleUiTheme] = useUiTheme();

  useEffect(() => {
    api.listThemes().then(setThemes).catch(() => setThemes([]));
  }, []);

  return (
    <div className="toolbar">
      <button onClick={close} title="Back to deck list">
        ←
      </button>
      <span className="toolbar-title">
        {meta.title || meta.path}
        {dirty && <span className="dirty-dot" title="Unsaved changes" />}
      </span>
      <div className="toolbar-spacer" />
      <button onClick={() => useDeckStore.temporal.getState().undo()} title="Undo (Ctrl+Z)">
        ↩
      </button>
      <button onClick={() => useDeckStore.temporal.getState().redo()} title="Redo (Ctrl+Y)">
        ↪
      </button>
      {themes.length > 0 && (
        <select
          value={meta.theme ?? ''}
          onChange={(e) => setTheme(e.target.value)}
          title="Theme"
        >
          {meta.theme === null && <option value="">custom theme</option>}
          {themes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      )}
      <button
        onClick={toggleUiTheme}
        title={`Switch editor to ${uiTheme === 'light' ? 'dark' : 'light'} mode`}
      >
        {uiTheme === 'light' ? '🌙' : '☀️'}
      </button>
      <button
        onClick={() => window.open(`/files/${meta.path}`, '_blank')}
        title="Open the real file — exactly what your audience sees"
      >
        Present
      </button>
      <button className="primary" disabled={!dirty || saving} onClick={() => void save()}>
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}
