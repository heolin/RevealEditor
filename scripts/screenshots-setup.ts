import fs from 'node:fs';
import path from 'node:path';

/** Copy the curated sample decks into a disposable workspace the screenshot
 *  run serves and (harmlessly) writes to, keeping the source decks pristine. */
export default function screenshotsSetup(): void {
  const root = path.dirname(new URL(import.meta.url).pathname);
  const repo = path.join(root, '..');
  const src = path.join(repo, 'scripts', 'sample-workspace');
  const dest = path.join(repo, '.screenshots-workspace');
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
}
