import { useDeckStore } from '../state/deckStore';

/** Append a marker-keyed rule block to the deck's managed style block once. */
export function ensureManagedBlock(marker: string, css: string): void {
  const store = useDeckStore.getState();
  if (!store.meta || store.meta.managedCss.includes(marker)) return;
  const existing = store.meta.managedCss.trim();
  const block = `${marker}\n${css}`;
  store.setManagedCss(existing ? `${existing}\n\n${block}` : block);
}
