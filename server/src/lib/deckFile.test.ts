import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDeck, updateDeck, resourceRefs, rewriteResourceRefs } from './deckFile.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, '../../test/fixtures');

function fixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES, name), 'utf8');
}

const ALL_FIXTURES = fs.readdirSync(FIXTURES).filter((f) => f.endsWith('.html'));

describe('parseDeck', () => {
  it('locates sections including vertical stacks', () => {
    const info = parseDeck(fixture('demo.html'));
    expect(info.sections).toHaveLength(4);
    expect(info.sections[2].children).toHaveLength(2);
    expect(info.sections[0].children).toBeUndefined();
  });

  it('section source slices are exact substrings of the file', () => {
    const src = fixture('demo.html');
    const info = parseDeck(src);
    for (const s of info.sections) {
      expect(src).toContain(s.source);
      expect(s.source.startsWith('<section')).toBe(true);
      expect(s.source.endsWith('</section>')).toBe(true);
      for (const c of s.children ?? []) {
        expect(s.source).toContain(c.source);
      }
    }
  });

  it('captures raw attribute text', () => {
    const info = parseDeck(fixture('demo.html'));
    expect(info.sections[1].attrsText).toBe(' data-background-color="#1a2633"');
  });

  it('extracts theme, title, stylesheets, config', () => {
    const info = parseDeck(fixture('demo.html'));
    expect(info.theme).toBe('black');
    expect(info.title).toBe('RevealEditor demo deck');
    expect(info.stylesheets).toHaveLength(3);
    expect(info.config).toEqual({ width: 960, height: 700, center: true, margin: 0.04, slideNumber: false });
  });

  it('reads custom width/height from Reveal.initialize', () => {
    const info = parseDeck(fixture('weird.html'));
    expect(info.config.width).toBe(1280);
    expect(info.config.height).toBe(720);
  });

  it('handles a fully custom-styled deck (no theme link, center:false)', () => {
    const info = parseDeck(fixture('benchmarks.html'));
    expect(info.theme).toBeNull();
    expect(info.themeHref).toBeNull();
    expect(info.sections).toHaveLength(21);
    expect(info.config).toEqual({ width: 1280, height: 720, center: false, margin: 0.025, slideNumber: false });
  });

  it('collects user <style> blocks so custom designs reach canvas/preview', () => {
    const bench = parseDeck(fixture('benchmarks.html'));
    expect(bench.headStyles).toHaveLength(1);
    expect(bench.headStyles[0]).toContain('--paper');
    const demo = parseDeck(fixture('demo.html'));
    expect(demo.headStyles).toHaveLength(1);
    expect(demo.headStyles[0]).toContain('.brand');
  });

  it('excludes the managed style block from headStyles', () => {
    const src = updateDeck(fixture('demo.html'), { managedCss: '.re-x { color: red; }' });
    const info = parseDeck(src);
    expect(info.headStyles).toHaveLength(1);
    expect(info.headStyles[0]).not.toContain('.re-x');
    expect(info.managedCss).toContain('.re-x');
  });

  it('rejects non-reveal HTML', () => {
    expect(() => parseDeck('<html><body><p>hi</p></body></html>')).toThrow();
  });

  it('leading + source + trailing reconstructs the slides region byte-identically for every fixture', () => {
    for (const name of ALL_FIXTURES) {
      const src = fixture(name);
      const info = parseDeck(src);
      const region = src.slice(info.slidesRange.start, info.slidesRange.end);
      const composed =
        info.sections.map((s) => s.leading + s.source).join('') + info.slidesTrailing;
      expect(composed, name).toBe(region);
    }
  });

  it('stack children reconstruct their wrapper inner byte-identically', () => {
    for (const name of ALL_FIXTURES) {
      const src = fixture(name);
      for (const s of parseDeck(src).sections) {
        if (!s.children) continue;
        const inner =
          s.children.map((c) => c.leading + c.source).join('') + s.innerTrailing;
        expect(`<section${s.attrsText}>${inner}</section>`, name).toBe(s.source);
      }
    }
  });

  it('captures comments between sections in leading text', () => {
    const info = parseDeck(fixture('weird.html'));
    expect(info.sections[0].leading).toContain('<!-- a comment between sections -->');
  });

  it('reports the section indentation', () => {
    expect(parseDeck(fixture('demo.html')).sectionIndent).toBe('      ');
  });
});

describe('updateDeck round-trip', () => {
  it('no-op update is byte-identical for every fixture', () => {
    for (const name of ALL_FIXTURES) {
      const src = fixture(name);
      expect(updateDeck(src, {}), name).toBe(src);
    }
  });

  it('splicing back the original slides region is byte-identical', () => {
    for (const name of ALL_FIXTURES) {
      const src = fixture(name);
      const info = parseDeck(src);
      const original = src.slice(info.slidesRange.start, info.slidesRange.end);
      expect(updateDeck(src, { slidesHtml: original }), name).toBe(src);
    }
  });

  it('replaces slides content without touching anything else', () => {
    const src = fixture('demo.html');
    const info = parseDeck(src);
    const updated = updateDeck(src, { slidesHtml: '\n<section><h1>Only</h1></section>\n' });
    expect(updated).toContain('<section><h1>Only</h1></section>');
    // Everything outside the slides region is byte-identical.
    expect(updated.slice(0, info.slidesRange.start)).toBe(src.slice(0, info.slidesRange.start));
    expect(updated.slice(updated.length - (src.length - info.slidesRange.end))).toBe(
      src.slice(info.slidesRange.end),
    );
    // User comment in config survives.
    expect(updated).toContain('// user comment inside config');
  });

  it('swaps the theme name inside the href only', () => {
    const src = fixture('demo.html');
    const updated = updateDeck(src, { theme: 'moon' });
    expect(updated).toContain('dist/theme/moon.css');
    expect(updated).not.toContain('dist/theme/black.css');
    // Reverting restores the exact original bytes.
    expect(updateDeck(updated, { theme: 'black' })).toBe(src);
  });

  it('updates the title with escaping', () => {
    const src = fixture('demo.html');
    const updated = updateDeck(src, { title: 'A <new> & better title' });
    expect(updated).toContain('<title>A &lt;new&gt; &amp; better title</title>');
  });

  it('inserts a managed style block on demand, then updates it in place', () => {
    const src = fixture('demo.html');
    const v1 = updateDeck(src, { managedCss: '.re-table--striped td { padding: 4px; }' });
    expect(v1).toContain('<style data-revealeditor="managed">');
    expect(v1).toContain('.re-table--striped td');
    const v2 = updateDeck(v1, { managedCss: '/* replaced */' });
    expect(v2).toContain('/* replaced */');
    expect(v2).not.toContain('.re-table--striped td');
    expect(v2.match(/data-revealeditor/g)).toHaveLength(1);
  });

  it('writes width/height into Reveal.initialize: replace and insert', () => {
    // weird.html HAS width/height → digits replaced in place, revert is exact.
    const weird = fixture('weird.html');
    const resized = updateDeck(weird, { configPatch: { width: 1920, height: 1080 } });
    expect(parseDeck(resized).config.width).toBe(1920);
    expect(parseDeck(resized).config.height).toBe(1080);
    expect(updateDeck(resized, { configPatch: { width: 1280, height: 720 } })).toBe(weird);

    // demo.html has NO width/height → keys inserted after the opening brace.
    const demo = fixture('demo.html');
    const withSize = updateDeck(demo, { configPatch: { width: 1280, height: 720 } });
    const info = parseDeck(withSize);
    expect(info.config.width).toBe(1280);
    expect(info.config.height).toBe(720);
    // user comment inside config survives the insertion
    expect(withSize).toContain('// user comment inside config');
  });

  it('writes slideNumber into Reveal.initialize: insert, then replace in place', () => {
    const demo = fixture('demo.html');
    expect(parseDeck(demo).config.slideNumber).toBe(false);
    const numbered = updateDeck(demo, { configPatch: { slideNumber: true } });
    expect(parseDeck(numbered).config.slideNumber).toBe(true);
    expect(numbered).toContain('slideNumber: true');
    // Existing key → the boolean is replaced in place, not duplicated.
    const off = updateDeck(numbered, { configPatch: { slideNumber: false } });
    expect(parseDeck(off).config.slideNumber).toBe(false);
    expect(off.match(/slideNumber/g)).toHaveLength(1);
  });

  it('handles weird formatting (single quotes, odd whitespace, comments between sections)', () => {
    const src = fixture('weird.html');
    const info = parseDeck(src);
    expect(info.sections.length).toBeGreaterThan(0);
    expect(updateDeck(src, {}), 'no-op').toBe(src);
    const original = src.slice(info.slidesRange.start, info.slidesRange.end);
    expect(updateDeck(src, { slidesHtml: original })).toBe(src);
  });
});

describe('resourceRefs / rewriteResourceRefs (bundle offline)', () => {
  const html = [
    '<!doctype html><html><head>',
    '<link rel="stylesheet" href="https://cdn.example.com/reveal.js@5/dist/reveal.css">',
    "<link rel='stylesheet' href='dist/theme/black.css'>",
    '<link rel="preconnect" href="https://fonts.example.com">',
    '</head><body>',
    '<script src="//cdn.example.com/reveal.js@5/dist/reveal.js"></script>',
    '<script src="local/plugin.js"></script>',
    '</body></html>',
  ].join('\n');

  it('finds only stylesheet links and script[src], with exact value ranges', () => {
    const refs = resourceRefs(html);
    // preconnect link is excluded; both stylesheets + both scripts included.
    expect(refs.map((r) => r.url)).toEqual([
      'https://cdn.example.com/reveal.js@5/dist/reveal.css',
      'dist/theme/black.css',
      '//cdn.example.com/reveal.js@5/dist/reveal.js',
      'local/plugin.js',
    ]);
    // Each value range slices back to exactly the url (quotes excluded).
    for (const r of refs) expect(html.slice(r.valueRange.start, r.valueRange.end)).toBe(r.url);
  });

  it('rewrites remote refs in place, leaving everything else byte-identical', () => {
    const refs = resourceRefs(html);
    const remote = refs.filter((r) => /^(?:https?:)?\/\//i.test(r.url));
    expect(remote).toHaveLength(2);
    const out = rewriteResourceRefs(html, [
      { range: remote[0].valueRange, href: 'vendor/cdn.example.com/reveal.js@5/dist/reveal.css' },
      { range: remote[1].valueRange, href: 'vendor/cdn.example.com/reveal.js@5/dist/reveal.js' },
    ]);
    expect(out).toContain('href="vendor/cdn.example.com/reveal.js@5/dist/reveal.css"');
    expect(out).toContain('src="vendor/cdn.example.com/reveal.js@5/dist/reveal.js"');
    // Untouched refs and surrounding markup survive verbatim.
    expect(out).toContain("href='dist/theme/black.css'");
    expect(out).toContain('src="local/plugin.js"');
    expect(out).toContain('<link rel="preconnect" href="https://fonts.example.com">');
    // Byte-surgical: only the two value spans changed.
    expect(out.length).toBe(
      html.length +
        ('vendor/cdn.example.com/reveal.js@5/dist/reveal.css'.length -
          'https://cdn.example.com/reveal.js@5/dist/reveal.css'.length) +
        ('vendor/cdn.example.com/reveal.js@5/dist/reveal.js'.length -
          '//cdn.example.com/reveal.js@5/dist/reveal.js'.length),
    );
  });

  it('no-op when there is nothing to rewrite', () => {
    expect(rewriteResourceRefs(html, [])).toBe(html);
  });
});
