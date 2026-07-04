/**
 * Workspace = the folder of presentations the server was pointed at.
 * All file access is confined to it.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseDeck } from './deckFile.js';

export interface DeckSummary {
  path: string; // workspace-relative, posix separators
  title: string;
  mtime: number;
  slideCount: number;
  /** Everything the deck-grid needs to render a first-slide miniature. */
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

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', '.cache']);
const MAX_DECK_BYTES = 4 * 1024 * 1024;

export class Workspace {
  /** Absolute workspace root. Mutable so the app can switch folders at runtime
   *  (see setRoot) without recreating routers — they read this per request. */
  root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  /** Re-root the workspace at a new absolute-or-relative directory. */
  setRoot(newRoot: string): void {
    this.root = path.resolve(newRoot);
  }

  /** Resolve a workspace-relative path, rejecting traversal outside the root. */
  resolve(relPath: string): string {
    const abs = path.resolve(this.root, relPath);
    if (abs !== this.root && !abs.startsWith(this.root + path.sep)) {
      throw new PathError(`Path escapes workspace: ${relPath}`);
    }
    return abs;
  }

  relative(absPath: string): string {
    return path.relative(this.root, absPath).split(path.sep).join('/');
  }

  async listDecks(): Promise<DeckSummary[]> {
    const decks: DeckSummary[] = [];
    await this.scanDir(this.root, decks);
    decks.sort((a, b) => a.path.localeCompare(b.path));
    return decks;
  }

  private async scanDir(dir: string, out: DeckSummary[]): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          await this.scanDir(abs, out);
        }
      } else if (entry.isFile() && entry.name.endsWith('.html')) {
        const summary = await this.tryReadDeckSummary(abs);
        if (summary) out.push(summary);
      }
    }
  }

  private async tryReadDeckSummary(abs: string): Promise<DeckSummary | null> {
    try {
      const stat = await fs.stat(abs);
      if (stat.size > MAX_DECK_BYTES) return null;
      const src = await fs.readFile(abs, 'utf8');
      if (!/class\s*=\s*["'][^"']*\breveal\b/.test(src)) return null;
      if (!/class\s*=\s*["'][^"']*\bslides\b/.test(src)) return null;
      const info = parseDeck(src);
      const slideCount = info.sections.reduce(
        (n, s) => n + (s.children ? s.children.length : 1),
        0,
      );
      const first = info.sections[0];
      return {
        path: this.relative(abs),
        title: info.title || path.basename(abs, '.html'),
        mtime: Math.round(stat.mtimeMs),
        slideCount,
        preview: {
          firstSlide: first ? (first.children?.[0] ?? first).source : null,
          theme: info.theme,
          themeHref: info.themeHref,
          stylesheets: info.stylesheets,
          headStyles: info.headStyles,
          managedCss: info.managedCss,
          config: info.config,
        },
      };
    } catch {
      return null;
    }
  }

  async readDeck(relPath: string): Promise<{ src: string; mtime: number }> {
    const abs = this.resolve(relPath);
    const [src, stat] = await Promise.all([fs.readFile(abs, 'utf8'), fs.stat(abs)]);
    return { src, mtime: Math.round(stat.mtimeMs) };
  }

  /** Atomic write: temp file in the same directory, then rename. */
  async writeDeck(relPath: string, content: string): Promise<number> {
    const abs = this.resolve(relPath);
    const tmp = path.join(
      path.dirname(abs),
      `.${path.basename(abs)}.${crypto.randomBytes(4).toString('hex')}.tmp`,
    );
    await fs.writeFile(tmp, content, 'utf8');
    await fs.rename(tmp, abs);
    const stat = await fs.stat(abs);
    return Math.round(stat.mtimeMs);
  }

  async mtime(relPath: string): Promise<number> {
    const stat = await fs.stat(this.resolve(relPath));
    return Math.round(stat.mtimeMs);
  }

  async exists(relPath: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(relPath));
      return true;
    } catch {
      return false;
    }
  }

  async ensureDirFor(relPath: string): Promise<void> {
    await fs.mkdir(path.dirname(this.resolve(relPath)), { recursive: true });
  }
}

export class PathError extends Error {}
