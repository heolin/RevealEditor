import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDeck, updateDeck } from './deckFile.js';

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
    expect(info.config).toEqual({ width: 960, height: 700, center: true, margin: 0.04 });
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
    expect(info.config).toEqual({ width: 1280, height: 720, center: false, margin: 0.025 });
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

  it('handles weird formatting (single quotes, odd whitespace, comments between sections)', () => {
    const src = fixture('weird.html');
    const info = parseDeck(src);
    expect(info.sections.length).toBeGreaterThan(0);
    expect(updateDeck(src, {}), 'no-op').toBe(src);
    const original = src.slice(info.slidesRange.start, info.slidesRange.end);
    expect(updateDeck(src, { slidesHtml: original })).toBe(src);
  });
});
