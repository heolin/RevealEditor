import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Workspace, PathError } from '../lib/workspace.js';
import { parseDeck, updateDeck, DeckParseError } from '../lib/deckFile.js';

const TEMPLATE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../templates/new-deck.html',
);

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
      const { path: relPath, title, theme } = req.body as {
        path?: string;
        title?: string;
        theme?: string;
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
        .replaceAll('{{theme}}', /^[\w-]+$/.test(theme || '') ? theme! : 'black');
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

  router.put('/deck', async (req, res, next) => {
    try {
      const relPath = deckPathParam(req);
      const { slidesHtml, theme, title, managedCss, addStylesheetLinks, baseMtime, force } =
        req.body as {
          slidesHtml?: string;
          theme?: string;
          title?: string;
          managedCss?: string;
          addStylesheetLinks?: string[];
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
      const updated = updateDeck(src, { slidesHtml, theme, title, managedCss, addStylesheetLinks });
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
