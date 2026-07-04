import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Workspace, PathError } from '../lib/workspace.js';
import {
  parseDeck,
  updateDeck,
  resourceRefs,
  rewriteResourceRefs,
  DeckParseError,
  type Region,
} from '../lib/deckFile.js';
import { referencedAssets } from '../lib/deckAssets.js';
import { makeZip } from '../lib/zip.js';

const VENDOR_TIMEOUT_MS = 20_000;
const VENDOR_MAX_BYTES = 25 * 1024 * 1024;

/**
 * Download one remote resource into `<deckdir>/vendor/<host>/<path>` and return
 * the deck-relative href to point at it. Confined to the workspace; only
 * http(s) is fetched. Throws on any failure so the caller can leave the
 * original remote href in place.
 */
async function downloadToVendor(
  ws: Workspace,
  deckDir: string,
  rawUrl: string,
): Promise<string> {
  const u = new URL(rawUrl.startsWith('//') ? `https:${rawUrl}` : rawUrl);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('unsupported protocol');
  const pathname = u.pathname.replace(/^\/+/, '');
  if (!pathname || pathname.endsWith('/')) throw new Error('no file to bundle');
  const vendorHref = ['vendor', u.host, ...pathname.split('/')].join('/');
  const relPath = path.posix.join(deckDir, vendorHref);
  const abs = ws.resolve(relPath); // confinement check

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VENDOR_TIMEOUT_MS);
  try {
    const resp = await fetch(u, { signal: controller.signal, redirect: 'follow' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length > VENDOR_MAX_BYTES) throw new Error('resource too large');
    await ws.ensureDirFor(relPath);
    await fs.writeFile(abs, buf);
  } finally {
    clearTimeout(timer);
  }
  return vendorHref;
}

/** Deepest directory that contains every given absolute file path. */
function commonDir(absPaths: string[]): string {
  const segLists = absPaths.map((p) => path.dirname(p).split(path.sep));
  let common = segLists[0];
  for (const segs of segLists.slice(1)) {
    let i = 0;
    while (i < common.length && i < segs.length && common[i] === segs[i]) i++;
    common = common.slice(0, i);
  }
  return common.join(path.sep) || path.sep;
}

const TEMPLATE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../templates/new-deck.html',
);

/** The slice of playwright's Browser/Page API the PDF route touches. */
interface PdfBrowser {
  newPage(opts: { viewport: { width: number; height: number } }): Promise<{
    goto(url: string, opts: { timeout: number }): Promise<unknown>;
    waitForSelector(sel: string, opts: { timeout: number }): Promise<unknown>;
    pdf(opts: { width: string; height: string; printBackground: boolean }): Promise<Buffer>;
  }>;
  close(): Promise<void>;
}

function deckPathParam(req: { query: Record<string, unknown> }): string {
  const p = req.query.path;
  if (typeof p !== 'string' || !p) throw new PathError('Missing ?path=');
  return p;
}

export function decksRouter(ws: Workspace): Router {
  const router = Router();

  router.get('/decks', async (_req, res, next) => {
    try {
      res.json(await ws.listDecks());
    } catch (err) {
      next(err);
    }
  });

  router.post('/decks', async (req, res, next) => {
    try {
      const { path: relPath, title, theme, width, height } = req.body as {
        path?: string;
        title?: string;
        theme?: string;
        width?: number;
        height?: number;
      };
      if (!relPath || !relPath.endsWith('.html')) {
        return res.status(400).json({ error: 'path must end with .html' });
      }
      if (await ws.exists(relPath)) {
        return res.status(409).json({ error: 'File already exists' });
      }
      const template = await fs.readFile(TEMPLATE_PATH, 'utf8');
      const content = template
        .replaceAll('{{title}}', escapeHtml(title || 'New presentation'))
        .replaceAll('{{theme}}', /^[\w-]+$/.test(theme || '') ? theme! : 'black')
        .replaceAll('{{width}}', String(Number.isFinite(width) && width! > 0 ? width : 1280))
        .replaceAll('{{height}}', String(Number.isFinite(height) && height! > 0 ? height : 720));
      await ws.ensureDirFor(relPath);
      const mtime = await ws.writeDeck(relPath, content);
      res.status(201).json({ path: relPath, mtime });
    } catch (err) {
      next(err);
    }
  });

  router.get('/deck', async (req, res, next) => {
    try {
      const relPath = deckPathParam(req);
      const { src, mtime } = await ws.readDeck(relPath);
      const info = parseDeck(src);
      res.json({
        path: relPath,
        title: info.title,
        theme: info.theme,
        themeHref: info.themeHref,
        stylesheets: info.stylesheets,
        headStyles: info.headStyles,
        managedCss: info.managedCss,
        config: info.config,
        sections: info.sections,
        slidesTrailing: info.slidesTrailing,
        sectionIndent: info.sectionIndent,
        mtime,
      });
    } catch (err) {
      next(err);
    }
  });

  /** Lightweight freshness probe — the client polls this to detect edits
   *  made outside the editor ("file changed on disk" banner). */
  router.get('/deck/stat', async (req, res, next) => {
    try {
      const relPath = deckPathParam(req);
      res.json({ path: relPath, mtime: await ws.mtime(relPath) });
    } catch (err) {
      next(err);
    }
  });

  /**
   * PDF export phase 2 (FEATURES §N): headless Chromium prints the deck's
   * own `?print-pdf` view and streams a real .pdf back. Playwright is an
   * OPTIONAL dependency — without it the endpoint answers 501 and the
   * client falls back to the guided print flow.
   */
  router.post('/deck/pdf', async (req, res, next) => {
    try {
      const relPath = deckPathParam(req);
      let chromium: { launch(): Promise<PdfBrowser> };
      try {
        const modName = 'playwright'; // non-literal: resolved at runtime only
        ({ chromium } = (await import(modName)) as {
          chromium: { launch(): Promise<PdfBrowser> };
        });
      } catch {
        return res
          .status(501)
          .json({ error: 'PDF rendering requires the optional playwright dependency' });
      }
      const { src } = await ws.readDeck(relPath);
      const { width, height } = parseDeck(src).config;
      const origin = `${req.protocol}://${req.get('host')}`;
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage({ viewport: { width, height } });
        await page.goto(`${origin}/files/${relPath}?print-pdf`, { timeout: 20_000 });
        // reveal's print layout paginates asynchronously.
        await page.waitForSelector('.pdf-page', { timeout: 15_000 });
        const pdf = await page.pdf({
          width: `${width}px`,
          height: `${height}px`,
          printBackground: true,
        });
        const name = relPath.split('/').pop()!.replace(/\.html$/, '');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${name}.pdf"`);
        res.send(pdf);
      } finally {
        await browser.close();
      }
    } catch (err) {
      next(err);
    }
  });

  /**
   * Export the deck plus its referenced local assets as a .zip (FEATURES §N).
   * The archive mirrors the on-disk layout relative to the deepest shared
   * ancestor of the deck and its assets, so every relative href still
   * resolves when the zip is unpacked. Assets outside the workspace, missing
   * files, and remote URLs are skipped.
   */
  router.get('/deck/zip', async (req, res, next) => {
    try {
      const relPath = deckPathParam(req);
      const { src } = await ws.readDeck(relPath);
      const deckAbs = ws.resolve(relPath);
      const deckDir = path.dirname(deckAbs);

      const files: { abs: string; data: Buffer }[] = [{ abs: deckAbs, data: Buffer.from(src, 'utf8') }];
      const seen = new Set<string>([deckAbs]);
      for (const rel of referencedAssets(src)) {
        const abs = path.resolve(deckDir, rel);
        if (abs !== ws.root && !abs.startsWith(ws.root + path.sep)) continue; // escapes workspace
        if (seen.has(abs)) continue;
        try {
          const data = await fs.readFile(abs);
          seen.add(abs);
          files.push({ abs, data });
        } catch {
          continue; // referenced file missing or unreadable — skip it
        }
      }

      const base = commonDir(files.map((f) => f.abs));
      const zip = makeZip(
        files.map((f) => ({ name: path.relative(base, f.abs).split(path.sep).join('/'), data: f.data })),
      );
      const name = path.basename(relPath).replace(/\.html$/, '');
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${name}.zip"`);
      res.send(zip);
    } catch (err) {
      next(err);
    }
  });

  /**
   * Bundle offline (FEATURES §N): download the deck's remote `<link>`/`<script>`
   * resources into `<deckdir>/vendor/` and rewrite each href/src to the local
   * copy — byte-surgically, like the theme swap — so the deck presents with no
   * network. Idempotent: refs already pointing at local files are left alone.
   * Downloads that fail keep their original remote href (partial bundle).
   */
  router.post('/deck/bundle', async (req, res, next) => {
    try {
      const relPath = deckPathParam(req);
      const { src } = await ws.readDeck(relPath);
      const deckDir = path.posix.dirname(relPath);
      const remote = resourceRefs(src).filter((r) => /^(?:https?:)?\/\//i.test(r.url));

      const bundled: string[] = [];
      const failed: { url: string; error: string }[] = [];
      const rewrites: { range: Region; href: string }[] = [];
      // Download each distinct URL once; reuse the local href for repeats.
      const resolved = new Map<string, string | null>();
      for (const ref of remote) {
        if (!resolved.has(ref.url)) {
          try {
            const href = await downloadToVendor(ws, deckDir, ref.url);
            resolved.set(ref.url, href);
            bundled.push(ref.url);
          } catch (err) {
            resolved.set(ref.url, null);
            failed.push({ url: ref.url, error: (err as Error).message });
          }
        }
        const href = resolved.get(ref.url);
        if (href) rewrites.push({ range: ref.valueRange, href });
      }

      if (rewrites.length === 0) {
        return res.json({ bundled, failed, mtime: await ws.mtime(relPath) });
      }
      const mtime = await ws.writeDeck(relPath, rewriteResourceRefs(src, rewrites));
      res.json({ bundled, failed, mtime });
    } catch (err) {
      next(err);
    }
  });

  router.put('/deck', async (req, res, next) => {
    try {
      const relPath = deckPathParam(req);
      const { slidesHtml, theme, title, managedCss, addStylesheetLinks, configPatch, baseMtime, force } =
        req.body as {
          slidesHtml?: string;
          theme?: string;
          title?: string;
          managedCss?: string;
          addStylesheetLinks?: string[];
          configPatch?: { width?: number; height?: number; slideNumber?: boolean };
          baseMtime?: number;
          force?: boolean;
        };
      const current = await ws.mtime(relPath);
      if (!force && baseMtime !== undefined && current !== baseMtime) {
        return res.status(409).json({
          error: 'File changed on disk since it was loaded',
          mtime: current,
        });
      }
      const { src } = await ws.readDeck(relPath);
      const updated = updateDeck(src, {
        slidesHtml,
        theme,
        title,
        managedCss,
        addStylesheetLinks,
        configPatch,
      });
      const mtime = await ws.writeDeck(relPath, updated);
      res.json({ mtime });
    } catch (err) {
      next(err);
    }
  });

  router.post('/deck/rename', async (req, res, next) => {
    try {
      const { path: relPath, newPath } = req.body as { path?: string; newPath?: string };
      if (!relPath || !newPath || !newPath.endsWith('.html')) {
        return res.status(400).json({ error: 'path and newPath (.html) required' });
      }
      if (await ws.exists(newPath)) {
        return res.status(409).json({ error: 'Target already exists' });
      }
      await ws.ensureDirFor(newPath);
      await fs.rename(ws.resolve(relPath), ws.resolve(newPath));
      res.json({ path: newPath });
    } catch (err) {
      next(err);
    }
  });

  router.post('/deck/duplicate', async (req, res, next) => {
    try {
      const { path: relPath } = req.body as { path?: string };
      if (!relPath) return res.status(400).json({ error: 'path required' });
      const base = relPath.replace(/\.html$/, '');
      let target = `${base}-copy.html`;
      for (let i = 2; await ws.exists(target); i++) target = `${base}-copy-${i}.html`;
      await fs.copyFile(ws.resolve(relPath), ws.resolve(target));
      const mtime = await ws.mtime(target);
      res.status(201).json({ path: target, mtime });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/deck', async (req, res, next) => {
    try {
      const relPath = deckPathParam(req);
      await fs.unlink(ws.resolve(relPath));
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function errorHandler(): import('express').ErrorRequestHandler {
  return (err, _req, res, _next) => {
    if (err instanceof PathError) {
      res.status(400).json({ error: err.message });
    } else if (err instanceof DeckParseError) {
      res.status(422).json({ error: err.message });
    } else if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      res.status(404).json({ error: 'Not found' });
    } else {
      console.error(err);
      res.status(500).json({ error: 'Internal error' });
    }
  };
}
