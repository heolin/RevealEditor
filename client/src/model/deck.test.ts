import { describe, it, expect } from 'vitest';
import type { SectionInfo } from '../api/client';
import { parseSections, composeSlides, composeColumn, type SlidesLayout } from './deck';

const plain: SectionInfo = {
  source: '<section data-x="1">\n  <h1>One</h1>\n</section>',
  leading: '\n      ',
  attrsText: ' data-x="1"',
  inner: '\n  <h1>One</h1>\n',
};

const stack: SectionInfo = {
  source:
    '<section class="wrap">\n  <!-- note -->\n  <section><p>a</p></section>\n  <section><p>b</p></section>\n</section>',
  leading: '\n      <!-- stack ahead -->\n      ',
  attrsText: ' class="wrap"',
  inner: '…',
  innerTrailing: '\n',
  children: [
    {
      source: '<section><p>a</p></section>',
      leading: '\n  <!-- note -->\n  ',
      attrsText: '',
      inner: '<p>a</p>',
    },
    {
      source: '<section><p>b</p></section>',
      leading: '\n  ',
      attrsText: '',
      inner: '<p>b</p>',
    },
  ],
};

const layout: SlidesLayout = { slidesTrailing: '\n    ', sectionIndent: '      ' };

describe('deck model', () => {
  it('parses plain sections and stacks into columns', () => {
    const cols = parseSections([plain, stack]);
    expect(cols).toHaveLength(2);
    expect(cols[0].isStack).toBe(false);
    expect(cols[1].isStack).toBe(true);
    expect(cols[1].slides).toHaveLength(2);
  });

  it('untouched deck composes byte-identically (leading + source + trailing)', () => {
    const cols = parseSections([plain, stack]);
    expect(composeSlides(cols, layout)).toBe(
      plain.leading + plain.source + stack.leading + stack.source + layout.slidesTrailing,
    );
  });

  it('column reorder keeps comments attached to their slides', () => {
    const cols = parseSections([plain, stack]);
    const reordered = [cols[1], cols[0]];
    const out = composeSlides(reordered, layout);
    expect(out.indexOf('<!-- stack ahead -->')).toBeLessThan(out.indexOf('data-x="1"'));
    expect(out).toContain(stack.source);
    expect(out).toContain(plain.source);
  });

  it('touched stacks recompose from wrapper attrs + child leadings, preserving inner comments', () => {
    const cols = parseSections([stack]);
    const touched = { ...cols[0] };
    delete touched.originalSource;
    touched.slides = [touched.slides[1], touched.slides[0]];
    expect(composeColumn(touched)).toBe(
      '<section class="wrap">\n  <section><p>b</p></section>\n  <!-- note -->\n  <section><p>a</p></section>\n</section>',
    );
  });

  it('an untouched-content stack recomposes byte-identically even without originalSource', () => {
    const cols = parseSections([stack]);
    const touched = { ...cols[0] };
    delete touched.originalSource;
    expect(composeColumn(touched)).toBe(stack.source);
  });
});
