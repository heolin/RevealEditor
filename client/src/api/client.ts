export interface SectionInfo {
  source: string;
  leading: string;
  attrsText: string;
  inner: string;
  children?: SectionInfo[];
  innerTrailing?: string;
}

export interface DeckSummary {
  path: string;
  title: string;
  mtime: number;
  slideCount: number;
}

export interface DeckData {
  path: string;
  title: string;
  theme: string | null;
  themeHref: string | null;
  stylesheets: string[];
  managedCss: string;
  config: { width: number; height: number };
  sections: SectionInfo[];
  slidesTrailing: string;
  sectionIndent: string;
  mtime: number;
}

export interface SavePayload {
  slidesHtml?: string;
  theme?: string;
  title?: string;
  managedCss?: string;
  baseMtime: number;
  force?: boolean;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const body = await res.json().catch(() => undefined);
  if (!res.ok) {
    const msg =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : `HTTP ${res.status}`;
    throw new ApiError(res.status, msg, body);
  }
  return body as T;
}

const q = (path: string) => `?path=${encodeURIComponent(path)}`;

export const api = {
  listDecks: () => request<DeckSummary[]>('/api/decks'),
  getDeck: (path: string) => request<DeckData>(`/api/deck${q(path)}`),
  saveDeck: (path: string, payload: SavePayload) =>
    request<{ mtime: number }>(`/api/deck${q(path)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  createDeck: (path: string, title: string, theme: string) =>
    request<{ path: string; mtime: number }>('/api/decks', {
      method: 'POST',
      body: JSON.stringify({ path, title, theme }),
    }),
  deleteDeck: (path: string) =>
    request<{ ok: true }>(`/api/deck${q(path)}`, { method: 'DELETE' }),
  listThemes: () => request<string[]>('/api/themes'),
};

/** Resolve a deck-relative or absolute stylesheet href to a URL the editor can load. */
export function resolveDeckUrl(deckPath: string, href: string): string {
  if (/^(https?:)?\/\//.test(href) || href.startsWith('/')) return href;
  const dir = deckPath.includes('/')
    ? deckPath.slice(0, deckPath.lastIndexOf('/') + 1)
    : '';
  return `/files/${dir}${href}`;
}

/** URL for a theme: built-in name via vendored reveal, otherwise the deck's own href. */
export function themeUrl(deckPath: string, theme: string | null, themeHref: string | null): string {
  if (theme) return `/vendor/reveal.js/dist/theme/${theme}.css`;
  if (themeHref) return resolveDeckUrl(deckPath, themeHref);
  return '/vendor/reveal.js/dist/theme/black.css';
}
