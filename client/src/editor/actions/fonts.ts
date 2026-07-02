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

export const FONT_SIZES: ActionOption[] = [
  { value: '', label: 'Default' },
  ...['0.5', '0.6', '0.7', '0.8', '0.9', '1', '1.2', '1.4', '1.7', '2', '2.5', '3'].map(
    (v) => ({ value: `${v}em`, label: `${v}em` }),
  ),
];
