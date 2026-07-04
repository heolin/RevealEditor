/**
 * Extract the LOCAL asset references from a deck's HTML — the relative
 * `src`/`href`/`url(...)`/`srcset` targets that resolve to files beside the
 * deck. Used by the zip export to bundle a deck with everything it needs.
 *
 * Only workspace-relative references are returned: absolute URLs (`http:`,
 * `//host`, `/root-absolute`), `data:`/`mailto:` schemes, and pure `#`
 * fragments are skipped — they either aren't files or don't live with the
 * deck. Query strings and hashes are stripped from the returned paths.
 */
export function referencedAssets(html: string): string[] {
  const urls = new Set<string>();

  const add = (raw: string | undefined): void => {
    if (!raw) return;
    let u = raw.trim().replace(/[?#].*$/, '');
    if (!u) return;
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return; // scheme: http:, data:, mailto:…
    if (u.startsWith('//')) return; // protocol-relative
    if (u.startsWith('/')) return; // server-root-absolute, not deck-relative
    if (u.startsWith('#')) return; // in-page fragment
    urls.add(u);
  };

  // Plain attribute references.
  const attrRe =
    /\b(?:src|href|poster|data-background-image|data-background-video)\s*=\s*("([^"]*)"|'([^']*)')/gi;
  for (const m of html.matchAll(attrRe)) add(m[2] ?? m[3]);

  // srcset: comma-separated "url [descriptor]" candidates.
  const srcsetRe = /\bsrcset\s*=\s*("([^"]*)"|'([^']*)')/gi;
  for (const m of html.matchAll(srcsetRe)) {
    const val = m[2] ?? m[3] ?? '';
    for (const part of val.split(',')) add(part.trim().split(/\s+/)[0]);
  }

  // CSS url(...) in inline styles and <style> blocks.
  const urlRe = /url\(\s*("([^"]*)"|'([^']*)'|([^'")]*))\s*\)/gi;
  for (const m of html.matchAll(urlRe)) add(m[2] ?? m[3] ?? m[4]);

  return [...urls];
}
