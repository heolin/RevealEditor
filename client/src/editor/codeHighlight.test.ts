import { describe, it, expect } from 'vitest';
import { hydrateCodeBlocks, setCodeText, codeTextOf } from './codeHighlight';
import { serializeSlide } from './serializeSlide';

function stage(html: string): HTMLElement {
  const section = document.createElement('section');
  section.id = 're-stage';
  section.className = 'present';
  section.innerHTML = html;
  return section;
}

describe('code highlighting round-trip', () => {
  it('display markup never reaches serialized output', () => {
    const s = stage(
      '<pre><code class="language-js" data-trim>const x = 1;\nreturn x;</code></pre>',
    );
    hydrateCodeBlocks(s);
    // Display DOM is highlighted…
    expect(s.querySelector('code')!.querySelector('span')).not.toBeNull();
    // …but serialization restores the raw text exactly. (The DOM serializer
    // normalizes valueless attributes to ="" — semantically identical.)
    expect(serializeSlide(s)).toBe(
      '<section><pre><code class="language-js" data-trim="">const x = 1;\nreturn x;</code></pre></section>',
    );
  });

  it('setCodeText updates truth and repaints display', () => {
    const s = stage('<pre><code class="language-js">old()</code></pre>');
    hydrateCodeBlocks(s);
    const code = s.querySelector('code')!;
    setCodeText(code, 'const fresh = true;');
    expect(codeTextOf(code)).toBe('const fresh = true;');
    expect(serializeSlide(s)).toContain('const fresh = true;');
    expect(serializeSlide(s)).not.toContain('old()');
  });

  it('escapes HTML-sensitive characters in serialized code', () => {
    const s = stage('<pre><code class="language-html"></code></pre>');
    hydrateCodeBlocks(s);
    setCodeText(s.querySelector('code')!, '<div class="x">&amp;</div>');
    const out = serializeSlide(s);
    expect(out).toContain('&lt;div class="x"&gt;&amp;amp;&lt;/div&gt;');
  });

  it('multiple code blocks keep their own raw text', () => {
    const s = stage(
      '<pre><code class="language-js">first</code></pre><pre><code class="language-js">second</code></pre>',
    );
    hydrateCodeBlocks(s);
    const out = serializeSlide(s);
    expect(out).toContain('first');
    expect(out).toContain('second');
  });
});
