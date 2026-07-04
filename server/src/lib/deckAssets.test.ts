import { describe, it, expect } from 'vitest';
import { referencedAssets } from './deckAssets.js';

describe('referencedAssets', () => {
  it('collects relative src/href/poster references', () => {
    const html = `
      <img src="assets/pic.png">
      <link rel="stylesheet" href="dist/reveal.css">
      <video poster="thumbs/cover.jpg"></video>
      <script src="dist/reveal.js"></script>
    `;
    expect(referencedAssets(html).sort()).toEqual(
      ['assets/pic.png', 'dist/reveal.css', 'dist/reveal.js', 'thumbs/cover.jpg'].sort(),
    );
  });

  it('skips remote, data, root-absolute, protocol-relative and fragment URLs', () => {
    const html = `
      <img src="https://cdn.example.com/x.png">
      <img src="//cdn.example.com/y.png">
      <img src="/root/z.png">
      <img src="data:image/png;base64,AAAA">
      <a href="#/2">next</a>
      <a href="mailto:me@example.com">mail</a>
    `;
    expect(referencedAssets(html)).toEqual([]);
  });

  it('strips query strings and hashes', () => {
    const html = `<img src="assets/pic.png?v=3#frag">`;
    expect(referencedAssets(html)).toEqual(['assets/pic.png']);
  });

  it('reads data-background-image and CSS url(...) targets, deduped', () => {
    const html = `
      <section data-background-image="bg/hero.jpg"></section>
      <style>.x { background: url('bg/hero.jpg'); } .y { background: url(bg/tile.png); }</style>
      <div style="background-image:url('bg/tile.png')"></div>
    `;
    // hero.jpg appears twice, tile.png twice — both collapse to one each.
    expect(referencedAssets(html).sort()).toEqual(['bg/hero.jpg', 'bg/tile.png'].sort());
  });

  it('takes the url part of each srcset candidate', () => {
    const html = `<img srcset="img/small.png 480w, img/large.png 1024w">`;
    expect(referencedAssets(html).sort()).toEqual(['img/large.png', 'img/small.png'].sort());
  });
});
