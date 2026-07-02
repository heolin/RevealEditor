import { describe, it, expect } from 'vitest';
import { serializeSlide, normalizeInlineMarkup } from './serializeSlide';
import { textHandler, genericHandler, handlerFor, textEditableFrom } from './registry';

function stage(html: string): HTMLElement {
  const section = document.createElement('section');
  section.id = 're-stage';
  section.className = 'present';
  section.innerHTML = html;
  return section;
}

describe('serializeSlide', () => {
  it('strips the stage id and present class', () => {
    const out = serializeSlide(stage('<h1>Hi</h1>'));
    expect(out).toBe('<section><h1>Hi</h1></section>');
  });

  it('preserves slide attributes and classes', () => {
    const s = stage('<p>x</p>');
    s.setAttribute('data-background-color', '#123');
    s.className = 'custom present';
    expect(serializeSlide(s)).toBe(
      '<section class="custom" data-background-color="#123"><p>x</p></section>',
    );
  });

  it('strips editor artifacts everywhere', () => {
    const s = stage(
      '<h2 contenteditable="true" spellcheck="false" data-re-x="1">T</h2>' +
        '<p class="">a</p><div style="">b</div>',
    );
    const out = serializeSlide(s);
    expect(out).not.toContain('contenteditable');
    expect(out).not.toContain('spellcheck');
    expect(out).not.toContain('data-re-');
    expect(out).not.toContain('class=""');
    expect(out).not.toContain('style=""');
  });

  it('strips fragment preview classes but keeps fragment itself', () => {
    const s = stage('<p class="fragment visible current-fragment fade-up">x</p>');
    expect(serializeSlide(s)).toBe(
      '<section><p class="fragment fade-up">x</p></section>',
    );
  });

  it('never mutates the live DOM', () => {
    const s = stage('<h2 contenteditable="true">T</h2>');
    serializeSlide(s);
    expect(s.querySelector('h2')!.getAttribute('contenteditable')).toBe('true');
  });

  it('leaves unknown markup byte-exact (attributes, custom tags, svg)', () => {
    const inner =
      '<div class="r-stack" data-custom="a&amp;b"><svg viewBox="0 0 1 1"><rect width="1" height="1"></rect></svg></div>';
    expect(serializeSlide(stage(inner))).toBe(`<section>${inner}</section>`);
  });
});

describe('normalizeInlineMarkup', () => {
  it('converts attribute-less b/i to strong/em', () => {
    const el = document.createElement('p');
    el.innerHTML = 'a <b>bold</b> and <i>it</i>';
    normalizeInlineMarkup(el);
    expect(el.innerHTML).toBe('a <strong>bold</strong> and <em>it</em>');
  });

  it('keeps b/i that carry attributes (icon fonts)', () => {
    const el = document.createElement('p');
    el.innerHTML = '<i class="fa fa-check"></i> done';
    normalizeInlineMarkup(el);
    expect(el.innerHTML).toBe('<i class="fa fa-check"></i> done');
  });

  it('unwraps style-only spans but keeps user spans', () => {
    const el = document.createElement('p');
    el.innerHTML = '<span style="font-weight:700">x</span> <span class="hl">y</span>';
    normalizeInlineMarkup(el);
    expect(el.innerHTML).toBe('x <span class="hl">y</span>');
  });

  it('keeps intentional range-formatting spans (color/font)', () => {
    const el = document.createElement('p');
    el.innerHTML =
      '<span style="color: red;">a</span><span style="font-size: 2em;">b</span>' +
      '<span style="font-family: Georgia, serif;">c</span><span style="font-style: italic;">d</span>';
    normalizeInlineMarkup(el);
    expect(el.innerHTML).toBe(
      '<span style="color: red;">a</span><span style="font-size: 2em;">b</span>' +
        '<span style="font-family: Georgia, serif;">c</span>d',
    );
  });

  it('removes empty formatting leftovers', () => {
    const el = document.createElement('p');
    el.innerHTML = 'a<strong></strong>b<em></em>';
    normalizeInlineMarkup(el);
    expect(el.innerHTML).toBe('ab');
  });
});

describe('registry', () => {
  it('claims text elements and lists', () => {
    for (const tag of ['h1', 'p', 'blockquote', 'ul', 'ol']) {
      expect(handlerFor(document.createElement(tag))).toBe(textHandler);
    }
  });

  it('divs are text only when inline-only', () => {
    const inline = document.createElement('div');
    inline.innerHTML = 'plain <strong>text</strong>';
    expect(handlerFor(inline)).toBe(textHandler);
    const block = document.createElement('div');
    block.innerHTML = '<p>nested</p>';
    expect(handlerFor(block)).toBe(genericHandler);
  });

  it('img/pre/table get their dedicated handlers', () => {
    expect(handlerFor(document.createElement('img')).type).toBe('image');
    expect(handlerFor(document.createElement('pre')).type).toBe('code');
    expect(handlerFor(document.createElement('table')).type).toBe('table');
  });

  it('svg/figure fall through to generic (until their handlers exist)', () => {
    for (const tag of ['svg', 'figure']) {
      expect(handlerFor(document.createElement(tag)).type).toBe('generic');
    }
  });

  it('textEditableFrom prefers the whole list over an li', () => {
    const section = document.createElement('section');
    section.innerHTML = '<ul><li id="target">x</li></ul>';
    const li = section.querySelector('#target')!;
    expect(textEditableFrom(li, section)?.tagName).toBe('UL');
  });

  it('textEditableFrom finds nothing inside pre', () => {
    const section = document.createElement('section');
    section.innerHTML = '<pre><code id="c">x</code></pre>';
    expect(textEditableFrom(section.querySelector('#c')!, section)).toBeNull();
  });
});
