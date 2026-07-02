import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { Workspace } from '../lib/workspace.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const ALLOWED_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif',
  '.mp4', '.webm', '.mp3', '.ogg', '.wav',
]);

export function assetsRouter(ws: Workspace): Router {
  const router = Router();

  // Upload an asset next to the deck: <deckDir>/assets/<name>
  router.post('/deck/assets', upload.single('file'), async (req, res, next) => {
    try {
      const deckPath = req.query.path;
      if (typeof deckPath !== 'string' || !deckPath) {
        return res.status(400).json({ error: 'Missing ?path=' });
      }
      if (!req.file) return res.status(400).json({ error: 'Missing file' });

      const ext = path.extname(req.file.originalname).toLowerCase();
      if (!ALLOWED_EXT.has(ext)) {
        return res.status(400).json({ error: `File type ${ext} not allowed` });
      }
      const base = path
        .basename(req.file.originalname, ext)
        .replace(/[^\w-]+/g, '-')
        .slice(0, 60) || 'asset';

      const deckDir = path.posix.dirname(deckPath);
      let relUrl = path.posix.join('assets', `${base}${ext}`);
      let relPath = path.posix.join(deckDir, relUrl);
      if (await ws.exists(relPath)) {
        const suffix = crypto.randomBytes(3).toString('hex');
        relUrl = path.posix.join('assets', `${base}-${suffix}${ext}`);
        relPath = path.posix.join(deckDir, relUrl);
      }
      await ws.ensureDirFor(relPath);
      await fs.writeFile(ws.resolve(relPath), req.file.buffer);
      // url is relative to the deck file — usable directly as <img src>
      res.status(201).json({ url: relUrl });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
