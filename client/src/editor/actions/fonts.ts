/**
 * Font families available to a deck: detected from its own CSS (font-family
 * declarations in headStyles + Google Fonts links) plus generic stacks.
 */
import type { DeckMeta } from '../../state/deckStore';
import type { ActionOption } from './types';

const GENERIC: ActionOption[] = [
  { value: 'Georgia, serif', label: 'Serif' },
  { value: 'Helvetica, Arial, sans-serif', label: 'Sans-serif' },
  { value: '"Courier New", monospace', label: 'Monospace' },
];

export function fontOptions(deck: DeckMeta | null): ActionOption[] {
  const detected = new Map<string, string>(); // label → css value
  if (deck) {
    // font-family declarations in the deck's own <style> blocks
    for (const css of deck.headStyles) {
      for (const m of css.matchAll(/font-family\s*:\s*([^;}]+)/gi)) {
        const stack = m[1].trim();
        const first = stack.split(',')[0].trim().replace(/^['"]|['"]$/g, '');
        if (first && !/^(inherit|initial|unset|var\()/.test(first)) {
          detected.set(first, stack.replace(/\s+/g, ' '));
        }
      }
    }
    // Google Fonts links: ...css2?family=Fraunces:ital,...&family=Newsreader:...
    for (const href of deck.stylesheets) {
      if (!href.includes('fonts.googleapis.com')) continue;
      for (const m of href.matchAll(/family=([^:&]+)/g)) {
        const name = decodeURIComponent(m[1]).replace(/\+/g, ' ');
        if (!detected.has(name)) detected.set(name, `'${name}'`);
      }
    }
  }
  const detectedOpts = [...detected.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, value]) => ({ value, label }));
  return [{ value: '', label: 'Theme default' }, ...detectedOpts, ...GENERIC];
}

/** Classic point-scale sizes in px — slides are a fixed 960×700 design
 *  space, so px are stable and WYSIWYG (em shifted with the theme's base). */
export const FONT_SIZES: ActionOption[] = [
  { value: '', label: 'Default' },
  ...[8, 9, 10, 11, 12, 14, 16, 18, 24, 30, 36, 48, 60, 72, 96].map((v) => ({
    value: `${v}px`,
    label: `${v}`,
  })),
];
