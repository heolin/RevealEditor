import fs from 'node:fs';
import path from 'node:path';

export default function globalSetup(): void {
  const root = path.dirname(new URL(import.meta.url).pathname);
  const repo = path.join(root, '..');
  const src = path.join(repo, 'demo-workspace');
  const dest = path.join(repo, '.e2e-workspace');
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
}
