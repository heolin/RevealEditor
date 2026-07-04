// Build the RevealEditor project site (GitHub Pages): a hand-authored landing
// page plus one styled HTML page per Markdown doc, rendered with `marked`.
// Output goes to `_site/`, which the Pages workflow uploads. Run locally with
// `npm run build:site` and open `_site/index.html` to preview.
import { marked } from 'marked';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '_site');

// User-facing pages — these get the top nav. Order = nav order.
const PAGES = [
  { src: 'docs/TUTORIAL.md', out: 'tutorial.html', label: 'Tutorial' },
  { src: 'docs/USAGE.md', out: 'usage.html', label: 'User guide' },
  { src: 'docs/FEATURES.md', out: 'features.html', label: 'Features' },
];

// Developer/reference docs — built and linked from the footer, not the top nav.
const DEV_PAGES = [
  { src: 'docs/ARCHITECTURE.md', out: 'architecture.html', label: 'Architecture' },
  { src: 'docs/DIAGRAMMING.md', out: 'diagramming.html', label: 'Diagramming' },
  { src: 'docs/TOOLBARS.md', out: 'toolbars.html', label: 'Toolbars' },
  { src: 'docs/ROADMAP.md', out: 'roadmap.html', label: 'Roadmap' },
];

const REPO_URL = 'https://github.com/heolin/RevealEditor';

const NAV = [{ out: 'index.html', label: 'Home' }, ...PAGES];

/** Rewrite inter-doc `*.md` links to their generated `.html` pages. */
function rewriteHref(href) {
  if (/^(https?:|mailto:|#)/i.test(href)) return href;
  const m = /^(?:\.\/)?(?:docs\/)?([^#/]+)\.md(#.*)?$/i.exec(href);
  if (!m) return href;
  const base = m[1].toLowerCase();
  const anchor = m[2] ?? '';
  return `${base === 'readme' ? 'index' : base}${'.html'}${anchor}`;
}

const CSS = `
:root {
  --bg: #ffffff; --fg: #1a1d24; --muted: #5b6472; --accent: #4f8ff7;
  --border: #e4e7ec; --code-bg: #f5f7fa; --card: #fbfcfe;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f1319; --fg: #e6e9ef; --muted: #9aa4b2; --accent: #6ba4ff;
    --border: #232a35; --code-bg: #161c25; --card: #141a22;
  }
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0; background: var(--bg); color: var(--fg);
  font: 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
.topbar {
  position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 20px;
  padding: 12px 24px; background: color-mix(in srgb, var(--bg) 88%, transparent);
  backdrop-filter: blur(8px); border-bottom: 1px solid var(--border);
}
.topbar .brand { font-weight: 700; letter-spacing: -0.01em; }
.topbar nav { display: flex; gap: 16px; flex-wrap: wrap; font-size: 14px; }
.topbar nav a.active { color: var(--fg); font-weight: 600; }
.topbar .spacer { flex: 1; }
.wrap { max-width: 860px; margin: 0 auto; padding: 40px 24px 80px; }
.doc h1, .doc h2, .doc h3 { line-height: 1.25; letter-spacing: -0.01em; }
.doc h1 { font-size: 2rem; margin: 0 0 0.5em; }
.doc h2 { font-size: 1.4rem; margin: 1.8em 0 0.6em; padding-top: 0.4em; border-top: 1px solid var(--border); }
.doc h3 { font-size: 1.1rem; margin: 1.4em 0 0.4em; }
.doc code { background: var(--code-bg); padding: 0.15em 0.4em; border-radius: 4px; font-size: 0.88em; }
.doc pre { background: var(--code-bg); padding: 16px; border-radius: 8px; overflow-x: auto; border: 1px solid var(--border); }
.doc pre code { background: none; padding: 0; }
.doc table { border-collapse: collapse; width: 100%; display: block; overflow-x: auto; margin: 1em 0; }
.doc th, .doc td { border: 1px solid var(--border); padding: 8px 12px; text-align: left; vertical-align: top; }
.doc th { background: var(--card); }
.doc blockquote { margin: 1em 0; padding: 0.4em 1em; border-left: 3px solid var(--accent); color: var(--muted); }
.doc img { max-width: 100%; border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 6px 24px rgba(0,0,0,0.10); margin: 0.6em 0; }
.shot { max-width: 1000px; margin: 0 auto; padding: 8px 24px 0; }
.shot img { width: 100%; border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 12px 48px rgba(0,0,0,0.16); }
.footer-dev { margin-top: 8px; font-size: 0.85rem; }
/* Landing */
.hero { text-align: center; padding: 72px 24px 40px; }
.hero h1 { font-size: clamp(2.4rem, 6vw, 3.6rem); margin: 0 0 0.2em; letter-spacing: -0.03em; }
.hero .tag { font-size: 1.25rem; color: var(--muted); max-width: 640px; margin: 0 auto 1.6em; }
.cta { display: inline-flex; gap: 12px; flex-wrap: wrap; justify-content: center; }
.btn { display: inline-block; padding: 11px 22px; border-radius: 8px; font-weight: 600; border: 1px solid var(--border); }
.btn.primary { background: var(--accent); color: #fff; border-color: transparent; }
.btn.primary:hover { text-decoration: none; filter: brightness(1.05); }
.btn:hover { text-decoration: none; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; margin: 24px 0; }
.card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
.card h3 { margin: 0 0 6px; font-size: 1.05rem; }
.card p { margin: 0; color: var(--muted); font-size: 0.95rem; }
.section-title { text-align: center; font-size: 1.6rem; margin: 48px 0 8px; letter-spacing: -0.01em; }
.footer { text-align: center; color: var(--muted); font-size: 0.9rem; padding: 40px 24px; border-top: 1px solid var(--border); }
`;

function topbar(currentOut) {
  const links = NAV.map(
    (p) => `<a href="${p.out}"${p.out === currentOut ? ' class="active"' : ''}>${p.label}</a>`,
  ).join('');
  return `<header class="topbar">
  <a class="brand" href="index.html">RevealEditor</a>
  <nav>${links}</nav>
  <span class="spacer"></span>
  <a href="${REPO_URL}">GitHub ↗</a>
</header>`;
}

function page({ title, currentOut, body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${CSS}</style>
</head>
<body>
${topbar(currentOut)}
${body}
<div class="footer">
  <div>RevealEditor — a WYSIWYG editor for reveal.js. <a href="${REPO_URL}">Source on GitHub</a>.</div>
  <div class="footer-dev">For developers: ${DEV_PAGES.map((p) => `<a href="${p.out}">${p.label}</a>`).join(' · ')}</div>
</div>
</body>
</html>
`;
}

/** GitHub-style heading slugs — marked v4+ no longer adds ids, but our docs
 *  link to sections (e.g. `#getting-started`), so we inject them ourselves. */
function addHeadingIds(html) {
  const used = new Map();
  return html.replace(/<h([1-6])>([\s\S]*?)<\/h\1>/g, (m, level, inner) => {
    const text = inner.replace(/<[^>]+>/g, '');
    let slug = text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-');
    if (!slug) return m;
    const n = used.get(slug) ?? 0;
    used.set(slug, n + 1);
    if (n) slug = `${slug}-${n}`;
    return `<h${level} id="${slug}">${inner}</h${level}>`;
  });
}

function renderDoc(md) {
  const html = addHeadingIds(marked.parse(md));
  return html.replace(/href="([^"]+)"/g, (_m, href) => `href="${rewriteHref(href)}"`);
}

const FEATURES = [
  ['File is truth', 'Opens hand-written reveal.js decks and saves clean HTML. Untouched slides stay byte-identical — no lock-in, git-friendly diffs.'],
  ['WYSIWYG at theme fidelity', 'Edit text, headings, lists and links in place, rendered with the deck’s real theme. Plain-text paste, alignment, colors, fonts.'],
  ['Tables & charts', 'Full table editing (merge, resize, CSV paste, presets) and charts baked to standalone SVG with the editable spec kept in the element.'],
  ['Shapes & diagramming', 'A shapes gallery, two-point connectors that snap to box anchors and stay attached, rotation/flip, groups, align & distribute.'],
  ['Layout & fragments', 'Free-position anything as plain inline styles, snap guides, z-order. Fragments with ordering and an in-editor step preview.'],
  ['Export & offline', 'One-click PDF, deck+assets as a .zip, and “bundle offline” to vendor the CDN reveal.js into the deck for airgapped presenting.'],
];

function landing() {
  const cards = FEATURES.map(([h, p]) => `<div class="card"><h3>${h}</h3><p>${p}</p></div>`).join('');
  const body = `<section class="hero">
  <h1>RevealEditor</h1>
  <p class="tag">A WYSIWYG editor for <a href="https://revealjs.com/">reveal.js</a> presentations. The HTML file on disk is the only source of truth — edit visually, save back clean, standalone HTML.</p>
  <div class="cta">
    <a class="btn primary" href="usage.html">Get started</a>
    <a class="btn" href="features.html">Features</a>
    <a class="btn" href="${REPO_URL}">GitHub</a>
  </div>
</section>
<div class="shot"><img src="images/editor-overview.png" alt="Editing a slide in RevealEditor — sorter, canvas, toolbar and inspector"></div>
<div class="wrap">
  <h2 class="section-title">Why RevealEditor</h2>
  <div class="grid">${cards}</div>
  <h2 class="section-title">Quick start</h2>
  <pre><code>npm install
npm run dev          # editor on http://localhost:5173

# or point it at your own talks:
npm run build
node server/dist/index.js ~/path/to/your/talks --port 4321</code></pre>
  <p style="text-align:center; margin-top:24px;">
    New here? Read the <a href="usage.html">user guide</a>, browse the
    <a href="features.html">feature catalog</a>, or see how it works in the
    <a href="architecture.html">architecture</a> doc.
  </p>
</div>`;
  return page({ title: 'RevealEditor — WYSIWYG editor for reveal.js', currentOut: 'index.html', body });
}

// ---- build ----
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

fs.writeFileSync(path.join(OUT, 'index.html'), landing());
// .nojekyll: we ship ready-made HTML; skip GitHub's Jekyll processing.
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

let built = 1;
for (const p of [...PAGES, ...DEV_PAGES]) {
  const abs = path.join(ROOT, p.src);
  if (!fs.existsSync(abs)) {
    console.warn(`skip (missing): ${p.src}`);
    continue;
  }
  const md = fs.readFileSync(abs, 'utf8');
  const title = `${p.label} — RevealEditor`;
  const body = `<div class="wrap doc">${renderDoc(md)}</div>`;
  fs.writeFileSync(path.join(OUT, p.out), page({ title, currentOut: p.out, body }));
  built++;
}

// Copy screenshots referenced by the landing + tutorial.
const imgSrc = path.join(ROOT, 'docs', 'images');
if (fs.existsSync(imgSrc)) {
  fs.cpSync(imgSrc, path.join(OUT, 'images'), { recursive: true });
}

console.log(`Built ${built} pages into ${path.relative(ROOT, OUT)}/`);
