/**
 * Background/text colors of the built-in reveal.js themes, so sorter
 * thumbnails roughly match the deck without loading full theme CSS.
 * (Theme-faithful thumbnails come later; this keeps them recognizable.)
 */
export interface ThemeColors {
  bg: string;
  text: string;
}

const THEME_COLORS: Record<string, ThemeColors> = {
  black: { bg: '#191919', text: '#fff' },
  'black-contrast': { bg: '#000', text: '#fff' },
  white: { bg: '#fff', text: '#222' },
  'white-contrast': { bg: '#fff', text: '#000' },
  white_contrast_compact_verbatim_headers: { bg: '#fff', text: '#000' },
  league: { bg: '#2b2b2b', text: '#eee' },
  beige: { bg: '#f7f3de', text: '#333' },
  night: { bg: '#111', text: '#eee' },
  serif: { bg: '#f0f1eb', text: '#000' },
  simple: { bg: '#fff', text: '#000' },
  solarized: { bg: '#fdf6e3', text: '#657b83' },
  moon: { bg: '#002b36', text: '#93a1a1' },
  dracula: { bg: '#282a36', text: '#f8f8f2' },
  sky: { bg: '#f7fbfc', text: '#333' },
  blood: { bg: '#222', text: '#eee' },
};

const FALLBACK: ThemeColors = { bg: '#191919', text: '#eee' };

export function themeColors(theme: string | null): ThemeColors {
  return (theme && THEME_COLORS[theme]) || FALLBACK;
}
