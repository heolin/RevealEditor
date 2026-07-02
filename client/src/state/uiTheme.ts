import { useEffect, useState } from 'react';

export type UiTheme = 'light' | 'dark';

const STORAGE_KEY = 'revealeditor-ui-theme';

function initialTheme(): UiTheme {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'dark' ? 'dark' : 'light';
}

/** Editor UI theme (not the presentation theme). Defaults to light, persisted. */
export function useUiTheme(): [UiTheme, () => void] {
  const [theme, setTheme] = useState<UiTheme>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  return [theme, () => setTheme((t) => (t === 'light' ? 'dark' : 'light'))];
}
