import { useDeckStore } from '../state/deckStore';

/** Append a marker-keyed rule block to the deck's managed style block once. */
export function ensureManagedBlock(marker: string, css: string): void {
  const store = useDeckStore.getState();
  if (!store.meta || store.meta.managedCss.includes(marker)) return;
  const existing = store.meta.managedCss.trim();
  const block = `${marker}\n${css}`;
  store.setManagedCss(existing ? `${existing}\n\n${block}` : block);
}

const PALETTE_MARKER = '/* re:colors */';
const PALETTE_RE = /\/\* re:colors \*\/\n:root \{ --re-colors: ([^;]*); \}/;

/** The deck's saved color slots — they live in the managed style block as a
 *  CSS custom property, so they travel WITH the file (unlike localStorage). */
export function deckColorSlots(): string[] {
  const css = useDeckStore.getState().meta?.managedCss ?? '';
  const m = PALETTE_RE.exec(css);
  return m ? m[1].split(' ').filter(Boolean) : [];
}

/** Save a color into the deck's slots (front of the list, capped, deduped). */
export function saveDeckColorSlot(color: string, max = 14): string[] {
  const store = useDeckStore.getState();
  if (!store.meta) return [];
  const next = [color, ...deckColorSlots().filter((c) => c !== color)].slice(0, max);
  const block = `${PALETTE_MARKER}\n:root { --re-colors: ${next.join(' ')}; }`;
  const css = store.meta.managedCss;
  store.setManagedCss(
    PALETTE_RE.test(css)
      ? css.replace(PALETTE_RE, block)
      : css.trim()
        ? `${css.trim()}\n\n${block}`
        : block,
  );
  return next;
}
