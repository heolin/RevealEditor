import { useEffect, useMemo, useRef, useState } from 'react';
import { useDeckStore } from '../../state/deckStore';
import { slideElement } from '../../model/deck';
import { themeUrl, resolveDeckUrl } from '../../api/client';

/**
 * Read-only slide canvas (M1): a same-origin iframe that loads reveal.css +
 * the theme + the deck's own stylesheets — but never the reveal.js runtime —
 * and renders the selected slide at design size, scaled to fit the pane.
 * The M2 editing engine (StageFrame) grows out of this component.
 */
export function SlideCanvas() {
  const meta = useDeckStore((s) => s.meta)!;
  const slide = useDeckStore((s) => {
    for (const col of s.columns) {
      const found = col.slides.find((sl) => sl.id === s.selectedSlideId);
      if (found) return found;
    }
    return null;
  });

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [frameReady, setFrameReady] = useState(0);
  const { width, height } = meta.config;

  const srcDoc = useMemo(() => {
    const dir = meta.path.includes('/')
      ? meta.path.slice(0, meta.path.lastIndexOf('/') + 1)
      : '';
    const userSheets = meta.stylesheets
      .filter((href) => !/reveal\.css|theme\/[\w-]+\.css/.test(href))
      .map((href) => `<link rel="stylesheet" href="${resolveDeckUrl(meta.path, href)}">`)
      .join('\n');
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<base href="/files/${dir}">
<link rel="stylesheet" href="/vendor/reveal.js/dist/reveal.css">
<link rel="stylesheet" href="${themeUrl(meta.path, meta.theme, meta.themeHref)}">
<link rel="stylesheet" href="/vendor/reveal.js/plugin/highlight/monokai.css">
${userSheets}
${meta.managedCss ? `<style>${meta.managedCss}</style>` : ''}
<style>
  /* Reveal themes paint the slide background on .reveal-viewport — a class the
     runtime adds to <body>. The runtime never runs here, so add it ourselves. */
  html, body { margin: 0; overflow: hidden; width: 100%; height: 100%; }
  .reveal { position: relative; width: 100%; height: 100%; overflow: hidden; }
  .reveal .slides { position: absolute; inset: 0; width: ${width}px; height: ${height}px; }
  /* Replicate reveal's centered layout statically — the runtime never runs here. */
  .reveal .slides > section.present {
    position: static;
    display: flex !important;
    flex-direction: column;
    justify-content: center;
    width: 100%;
    height: 100%;
    top: 0;
  }
  .reveal .slides section .fragment {
    visibility: visible !important;
    opacity: 1 !important;
    transform: none !important;
  }
  aside.notes { display: none !important; }
</style>
</head>
<body class="reveal-viewport">
<div class="reveal"><div class="slides"><section class="present" id="re-stage"></section></div></div>
</body>
</html>`;
  }, [meta.path, meta.theme, meta.themeHref, meta.stylesheets, meta.managedCss, width, height]);

  // Inject the selected slide's content + attributes into the stage section.
  useEffect(() => {
    const doc = iframeRef.current?.contentDocument;
    const stage = doc?.getElementById('re-stage');
    if (!doc || !stage) return;
    for (const name of stage.getAttributeNames()) {
      if (name !== 'id') stage.removeAttribute(name);
    }
    stage.className = 'present';
    if (!slide) {
      stage.innerHTML = '';
      return;
    }
    const parsed = slideElement(slide.source);
    if (!parsed) return;
    for (const attr of parsed.attributes) {
      if (attr.name === 'class') {
        stage.className = `${attr.value} present`;
      } else {
        stage.setAttribute(attr.name, attr.value);
      }
    }
    stage.innerHTML = parsed.innerHTML;
    // Per-slide background override (the runtime renders these into separate
    // background divs; statically, painting the viewport is equivalent).
    const bg =
      parsed.getAttribute('data-background-color') ??
      parsed.getAttribute('data-background') ??
      '';
    doc.body.style.background = bg;
  }, [slide, frameReady]);

  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;
    const observer = new ResizeObserver(() => {
      const rect = pane.getBoundingClientRect();
      setScale(
        Math.min((rect.width - 48) / width, (rect.height - 48) / height),
      );
    });
    observer.observe(pane);
    return () => observer.disconnect();
  }, [width, height]);

  return (
    <div className="canvas-pane" ref={paneRef}>
      <div
        className="canvas-stage"
        style={{ width: width * scale, height: height * scale }}
      >
        <iframe
          ref={iframeRef}
          title="Slide canvas"
          srcDoc={srcDoc}
          onLoad={() => setFrameReady((n) => n + 1)}
          style={{
            width,
            height,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            border: 'none',
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  );
}
