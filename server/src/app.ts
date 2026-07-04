import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Workspace } from './lib/workspace.js';
import { decksRouter, errorHandler } from './routes/decks.js';
import { assetsRouter } from './routes/assets.js';
import { designSystemsRouter, themesRouter } from './routes/themes.js';
import { workspaceRouter } from './routes/workspace.js';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));

export interface AppOptions {
  /** Allow re-rooting the workspace from the UI (POST /api/workspace). */
  allowWorkspaceChange?: boolean;
  /** Where to persist a workspace switch. */
  configPath?: string;
}

export function createApp(workspaceRoot: string, opts: AppOptions = {}): express.Express {
  const ws = new Workspace(workspaceRoot);
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  const revealPkg = path.dirname(require.resolve('reveal.js/package.json'));
  const revealDist = path.join(revealPkg, 'dist');
  const revealPlugin = path.join(revealPkg, 'plugin');

  app.use('/api', decksRouter(ws));
  app.use('/api', assetsRouter(ws));
  app.use('/api', themesRouter(revealDist));
  app.use('/api', designSystemsRouter(ws));
  app.use('/api', workspaceRouter(ws, opts));

  // Vendored reveal.js runtime — stable path for the preview harness and canvas.
  app.use('/vendor/reveal.js/dist', express.static(revealDist));
  app.use('/vendor/reveal.js/plugin', express.static(revealPlugin));

  // The whole workspace, served as-is (Present mode, images, shared CSS).
  // Resolved per request so a runtime workspace switch takes effect.
  app.use('/files', (req, res, next) => express.static(ws.root)(req, res, next));

  // Preview harness + any other server-owned static pages.
  app.use(express.static(path.join(HERE, '../public')));

  // Production: serve the built client if present.
  const clientDist = path.join(HERE, '../../client/dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get(/^\/(?!api|files|vendor).*/, (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use(errorHandler());
  return app;
}
