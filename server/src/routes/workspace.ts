import { Router } from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Workspace } from '../lib/workspace.js';
import { saveConfig } from '../lib/config.js';
import type { AppOptions } from '../app.js';

/** Expand a leading `~` to the user's home directory. */
function expandHome(p: string): string {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

/**
 * Active-workspace inspection and (optionally) switching. Switching is a local
 * convenience but a hosting hazard — it re-roots to any directory on the
 * machine — so it is gated behind `allowWorkspaceChange` (default off). When
 * off, POST answers 403 and the client hides the control.
 */
export function workspaceRouter(ws: Workspace, opts: AppOptions): Router {
  const router = Router();
  const canChange = opts.allowWorkspaceChange === true;

  router.get('/workspace', (_req, res) => {
    res.json({ path: ws.root, canChange });
  });

  router.post('/workspace', (req, res) => {
    if (!canChange) {
      return res.status(403).json({ error: 'Workspace switching is disabled on this server' });
    }
    const { path: raw } = req.body as { path?: string };
    if (!raw || typeof raw !== 'string' || !raw.trim()) {
      return res.status(400).json({ error: 'path required' });
    }
    const target = path.resolve(expandHome(raw.trim()));
    let stat;
    try {
      stat = fs.statSync(target);
    } catch {
      return res.status(404).json({ error: `No such directory: ${target}` });
    }
    if (!stat.isDirectory()) {
      return res.status(400).json({ error: `Not a directory: ${target}` });
    }
    ws.setRoot(target);
    if (opts.configPath) saveConfig(opts.configPath, { workspace: target });
    res.json({ path: ws.root, canChange });
  });

  return router;
}
