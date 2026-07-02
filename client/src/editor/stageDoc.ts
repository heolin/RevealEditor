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
    position: relative;
    ${center ? 'display: flex !important;\n    flex-direction: column;\n    justify-content: center;' : 'display: block !important;'}
    width: 100%;
    height: 100%;
    top: 0;
    /* Padding must count INTO the forced 100% box, like the runtime — decks
       with section padding (benchmarks: 48px) otherwise overflow right. */
    box-sizing: border-box;
  }
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
    var bg = s.getAttribute('data-background-color') || s.getAttribute('data-background') || '';
    var img = s.getAttribute('data-background-image');
    document.body.style.background = bg;
    if (img) {
      document.body.style.backgroundImage = 'url("' + img + '")';
      document.body.style.backgroundSize = 'cover';
      document.body.style.backgroundPosition = 'center';
    }
  }
</script>
</body>
</html>`;
}
