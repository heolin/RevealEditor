import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';

export function themesRouter(revealDistDir: string): Router {
  const router = Router();

  router.get('/themes', async (_req, res, next) => {
    try {
      const dir = path.join(revealDistDir, 'theme');
      const files = await fs.readdir(dir);
      const themes = files
        .filter((f) => f.endsWith('.css'))
        .map((f) => f.replace(/\.css$/, ''))
        .sort();
      res.json(themes);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
