/**
 * Shared document shell for slide-rendering surfaces (editing stage,
 * sorter thumbnails): reveal.css + theme + the deck's own stylesheets and
 * <style> blocks — everything a slide needs to look real, never the runtime.
 */
import type { DeckMeta } from '../state/deckStore';
import { REVEAL_CSS_RE, resolveDeckUrl, themeUrl } from '../api/client';

/** The subset of deck state slide-rendering surfaces need. */
export type StageMeta = Pick<
  DeckMeta,
  'path' | 'theme' | 'themeHref' | 'stylesheets' | 'headStyles' | 'managedCss' | 'config'
>;

export function stageHead(meta: StageMeta): string {
  const dir = meta.path.includes('/')
    ? meta.path.slice(0, meta.path.lastIndexOf('/') + 1)
    : '';
  const userSheets = meta.stylesheets
    .filter((href) => !REVEAL_CSS_RE.test(href))
    .map((href) => `<link rel="stylesheet" href="${resolveDeckUrl(meta.path, href)}">`)
    .join('\n');
  const userStyles = meta.headStyles.map((css) => `<style>${css}</style>`).join('\n');
  const theme = themeUrl(meta.path, meta.theme, meta.themeHref);
  return `<meta charset="utf-8">
<base href="/files/${dir}">
<link rel="stylesheet" href="/vendor/reveal.js/dist/reveal.css">
${theme ? `<link rel="stylesheet" href="${theme}">` : '<!-- custom-styled deck: no theme injected -->'}
<link rel="stylesheet" href="/vendor/reveal.js/plugin/highlight/monokai.css">
${userSheets}
${userStyles}
${meta.managedCss ? `<style>${meta.managedCss}</style>` : ''}`;
}

export function stageLayoutCss(meta: StageMeta): string {
  const { width, height, center } = meta.config;
  return `
  html, body { margin: 0; overflow: hidden; width: 100%; height: 100%; }
  .reveal { position: relative; width: 100%; height: 100%; overflow: hidden; }
  .reveal .slides { position: absolute; inset: 0; width: ${width}px; height: ${height}px; }
  .reveal .slides > section {
    /* Centering replicates reveal's REAL mechanism: block layout + measured
       top offset (--re-center-top set by the host/script). Flex emulation is
       wrong: vertical margin:auto (reveal.css tables!) absorbs free space in
       flex but is always 0 in the runtime's block layout. */
    position: absolute;
    display: block !important;
    width: 100%;
    ${center ? 'top: var(--re-center-top, 0px);' : 'height: 100%;\n    top: 0;'}
    /* Padding must count INTO the box, like the runtime — decks with
       section padding (benchmarks: 48px) otherwise overflow right. */
    box-sizing: border-box;
  }
  /* Pinned (free-layout) sections carry inline height + flex — top stays 0,
     and their inline flex centering must WIN over our block !important
     (otherwise remaining flow content jumps to the top in the canvas while
     the runtime, where inline styles rule, keeps it centered). */
  .reveal .slides > section[style*="height"] { top: 0; }
  .reveal .slides > section[style*="display: flex"] { display: flex !important; }
  .reveal .slides section .fragment {
    visibility: visible !important;
    opacity: 1 !important;
    transform: none !important;
  }
  aside.notes { display: none !important; }
  /* Native image drag-and-drop steals pointer events from element dragging. */
  img { -webkit-user-drag: none; user-select: none; }
  /* Text is selectable ONLY inside an active text session — otherwise moving
     an element must never start a text selection. */
  .reveal .slides section { user-select: none; }
  .reveal .slides section [contenteditable="true"],
  .reveal .slides section [contenteditable="true"] * { user-select: text; }
  /* Layout mode: expose the layout tree — dashed container outlines, and a
     minimum drop size so empty containers stay grabbable. */
  body[data-re-layout] .reveal .slides > section {
    outline: 1px dashed rgba(79, 143, 247, 0.45);
    outline-offset: -2px;
  }
  body[data-re-layout] .reveal .slides section :is(div, td, th, blockquote):not([data-re-shape]):not([data-re-chart]):not(.re-group) {
    outline: 1px dashed rgba(79, 143, 247, 0.55);
    outline-offset: 2px;
    min-height: 28px;
  }
  body[data-re-layout] .reveal .slides section pre :is(div, td, th) {
    outline: none;
    min-height: 0;
  }
  /* Content components get a neutral dashed outline (containers stay blue).
     Code-block internals are excluded — hljs wraps every token in a span. */
  body[data-re-layout] .reveal .slides section
    :is(h1, h2, h3, h4, h5, h6, p, span, a, ul, ol, img, table, figure, pre, svg):not(pre *):not(svg *) {
    outline: 1px dashed rgba(128, 128, 128, 0.6);
    outline-offset: 1px;
  }`;
}

/**
 * A complete, static miniature document for one slide: the slide's source
 * embedded directly, plus a tiny script replicating the per-slide background
 * (the runtime isn't there to paint it).
 */
export function thumbDoc(meta: StageMeta, slideSource: string): string {
  return `<!doctype html>
<html>
<head>
${stageHead(meta)}
<style>${stageLayoutCss(meta)}</style>
</head>
<body class="reveal-viewport">
<div class="reveal"><div class="slides">
${slideSource}
</div></div>
<script>
  var s = document.querySelector('.slides > section');
  if (s) {
    s.classList.add('present');
    // Highlight-theme block background (miniatures embed raw source, which
    // lacks the hljs class the live stage adds during hydration).
    s.querySelectorAll('pre > code').forEach(function (c) { c.classList.add('hljs'); });
    var bg = s.getAttribute('data-background-color') || s.getAttribute('data-background') || '';
    var img = s.getAttribute('data-background-image');
    document.body.style.background = bg;
    if (img) {
      document.body.style.backgroundImage = 'url("' + img + '")';
      document.body.style.backgroundSize = 'cover';
      document.body.style.backgroundPosition = 'center';
    }
    var recenter = function () {
      if (s.style.height) return; // pinned sections sit at top 0
      var top = Math.max(0, (${meta.config.height} - s.offsetHeight) / 2);
      s.parentElement.style.setProperty('--re-center-top', top + 'px');
    };
    ${meta.config.center ? 'recenter();\n    if (document.fonts) document.fonts.ready.then(recenter);' : ''}
  }
</script>
</body>
</html>`;
}
