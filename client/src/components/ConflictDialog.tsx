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
    <div className="modal-backdrop">
      <div className="modal">
        <h2>File changed on disk</h2>
        <p>
          <code>{meta.path}</code> was modified outside the editor since you opened it.
        </p>
        <div className="modal-actions">
          <button onClick={() => void reload()}>Reload from disk (discard my changes)</button>
          <button className="danger" onClick={() => void save({ force: true })}>
            Overwrite file
          </button>
          <button onClick={dismiss}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
