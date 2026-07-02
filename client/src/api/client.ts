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
  preview: {
    firstSlide: string | null;
    theme: string | null;
    themeHref: string | null;
    stylesheets: string[];
    headStyles: string[];
    managedCss: string;
    config: { width: number; height: number; center: boolean; margin: number };
  };
}

export interface DeckData {
  path: string;
  title: string;
  theme: string | null;
  themeHref: string | null;
  stylesheets: string[];
  headStyles: string[];
  managedCss: string;
  config: { width: number; height: number; center: boolean; margin: number };
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
  addStylesheetLinks?: string[];
  configPatch?: { width?: number; height?: number };
  baseMtime: number;
  force?: boolean;
}

export interface DesignComponent {
  id: string;
  name: string;
  description?: string;
  html: string;
}

export interface DesignSystem {
  dir: string;
  name: string;
  stylesheets: string[];
  components: DesignComponent[];
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
  createDeck: (path: string, title: string, theme: string, width = 1280, height = 720) =>
    request<{ path: string; mtime: number }>('/api/decks', {
      method: 'POST',
      body: JSON.stringify({ path, title, theme, width, height }),
    }),
  deleteDeck: (path: string) =>
    request<{ ok: true }>(`/api/deck${q(path)}`, { method: 'DELETE' }),
  renameDeck: (path: string, newPath: string) =>
    request<{ path: string }>('/api/deck/rename', {
      method: 'POST',
      body: JSON.stringify({ path, newPath }),
    }),
  duplicateDeck: (path: string) =>
    request<{ path: string }>('/api/deck/duplicate', {
      method: 'POST',
      body: JSON.stringify({ path }),
    }),
  listThemes: () => request<string[]>('/api/themes'),
  listDesignSystems: () => request<DesignSystem[]>('/api/design-systems'),
  editorConfig: () => request<unknown>('/api/editor-config'),
  uploadAsset: async (deckPath: string, file: File): Promise<{ url: string }> => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`/api/deck/assets${q(deckPath)}`, { method: 'POST', body: form });
    const body = await res.json().catch(() => undefined);
    if (!res.ok) {
      throw new ApiError(res.status, (body as { error?: string })?.error ?? `HTTP ${res.status}`, body);
    }
    return body as { url: string };
  },
};

/** Resolve a deck-relative or absolute stylesheet href to a URL the editor can load. */
export function resolveDeckUrl(deckPath: string, href: string): string {
  if (/^(https?:)?\/\//.test(href) || href.startsWith('/')) return href;
  const dir = deckPath.includes('/')
    ? deckPath.slice(0, deckPath.lastIndexOf('/') + 1)
    : '';
  return `/files/${dir}${href}`;
}

/**
 * URL for a theme: built-in name via vendored reveal, otherwise the deck's
 * own href. Returns null for decks with no theme link at all (fully
 * custom-styled decks) — injecting a default theme would pollute them.
 */
export function themeUrl(
  deckPath: string,
  theme: string | null,
  themeHref: string | null,
): string | null {
  if (theme) return `/vendor/reveal.js/dist/theme/${theme}.css`;
  if (themeHref) return resolveDeckUrl(deckPath, themeHref);
  return null;
}

/** Stylesheets from the deck head that the editor should NOT re-inject. */
export const REVEAL_CSS_RE = /reveal(\.min)?\.css|(?:^|\/)theme\/[\w-]+(\.min)?\.css/;

/** Relative posix path from a deck's directory to a workspace-relative target. */
export function relativeHref(deckPath: string, target: string): string {
  const fromParts = deckPath.split('/').slice(0, -1);
  const toParts = target.split('/');
  let common = 0;
  while (common < fromParts.length && common < toParts.length - 1 && fromParts[common] === toParts[common]) {
    common++;
  }
  const ups = fromParts.length - common;
  return [...Array<string>(ups).fill('..'), ...toParts.slice(common)].join('/');
}
