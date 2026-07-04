# RevealEditor — Feature Catalog

The complete feature inventory for the product, written down before implementation so the
architecture can be designed for all of it — even features we build later.
Execution plans for everything still open live in [ROADMAP.md](ROADMAP.md).

## Vision & non-negotiable principles

1. **The reveal.js HTML file on disk is the only source of truth.** The editor opens
   hand-written decks, edits them visually, saves back clean HTML. No proprietary format,
   no lock-in (the reason we left slides.com).
2. **Decks stay standalone.** A saved deck must open and present correctly with zero
   dependency on RevealEditor — from any static host, offline, forever. No feature may
   require our runtime inside the deck.
3. **Git-friendly.** Saves are deterministic; untouched slides are emitted byte-identical;
   diffs show only what changed.
4. **Don't destroy what you don't understand.** Arbitrary hand-written markup (custom divs,
   classes, SVG, MathJax, plugin markup) survives editing untouched.
5. **Every rich block is re-editable from the file alone.** Charts, shapes, tables carry
   their editable source (JSON spec, plain data) inside the HTML element itself — reopening
   a deck restores full editability with no sidecar files.

## Priority tiers

- **T1 — V1 core**: the initial "powerful V1" release target.
- **T2 — V1.x**: fast-follow, architecture must support it from day one.
- **T3 — V2+**: designed for now, built later.

---

## A. Workspace & deck management

| Feature | Tier | Notes |
|---|---|---|
| Deck list: recursive scan of workspace folder for reveal decks | T1 | Detect `div.slides`; show title, slide count, mtime |
| Create deck from template (title + theme) | T1 | Standalone HTML with pinned CDN reveal.js |
| Open arbitrary existing hand-written decks | T1 | Round-trip fidelity guarantee |
| Save with conflict detection | T1 | mtime check → 409 → reload/overwrite dialog |
| Rename / delete / duplicate deck | T1 | |
| External-change detection while editing | T2 | Shipped — 5s freshness poll + banner with reload/keep-editing |
| Deck templates gallery (user-defined starter decks) | T3 | A folder of template decks in the workspace |
| Multiple workspaces / recent workspaces | T3 | |

## B. Slide management

| Feature | Tier | Notes |
|---|---|---|
| 2-D slide sorter (horizontal columns, vertical stacks) | T1 | Mirrors reveal navigation; live thumbnails |
| Add / delete / duplicate / reorder slides (incl. into/out of vertical stacks) | T1 | Drag & drop + context menu |
| Copy/paste slides within and across decks | T2 | Shipped — system clipboard carries the `<section>` source (assets referenced by path) |
| Hidden slides (`data-visibility="hidden"`) | T1 | Badge in sorter |
| Slide numbering config surface | T2 | Shipped — inspector toggle, spliced into `Reveal.initialize` |
| Jump-to-slide search (by text content) | T2 | Shipped — sorter search box; Enter cycles matches |
| Section dividers / grouping labels in sorter | T3 | Editor-only metadata problem — likely HTML comments |

## C. Text

| Feature | Tier | Notes |
|---|---|---|
| WYSIWYG text editing at true theme fidelity | T1 | Scoped contenteditable per element |
| Headings H1–H6 ⇄ paragraph conversion (attributes preserved) | T1 | |
| Bold / italic / strikethrough / inline code | T1 | Normalized to `strong`/`em`/`s`/`code` |
| Bulleted & numbered lists, nesting via Tab/Shift-Tab | T1 | |
| Links: insert, edit, remove (attrs preserved on existing `<a>`) | T1 | |
| Blockquotes | T1 | |
| Plain-text paste (strip Word/Docs formatting) | T1 | Paste-with-formatting as explicit alternative (T2) |
| Text alignment per block (left/center/right) | T1 | Inline `text-align` |
| Text color & highlight color | T2 | Shipped — both; highlight styles the selected range (`background-color` span) |
| Font size per block (classic point scale) | T2 | Shipped — inline `font-size` in px (8–96); legacy em values stay selectable |
| Font family override per block | T2 | Shipped — families from deck CSS + generic stacks; theme entry shows the actual face |
| `r-fit-text` toggle (auto-fit headline) | T2 | Shipped — inspector toggle; dashed-underline marker in canvas, true size in preview |
| Text inside shapes | T2 | Shipped — see Shapes |
| Text-box box styling: background, padding, border, radius | T2 | Shipped — Inspector "Box" section, inline styles; makes a text box a diagram node (docs/DIAGRAMMING.md phase 3) |
| Find & replace across deck | T3 | |

## D. Images & media

| Feature | Tier | Notes |
|---|---|---|
| Insert image: upload, paste from clipboard, URL | T1 | Uploads land in `assets/` beside the deck |
| Resize (aspect-locked), reposition | T1 | |
| Alt text, title | T1 | Inspector fields |
| Rounded corners / border / shadow presets | T2 | Inline styles |
| Crop (visual, via wrapper with `overflow:hidden`) | T3 | Must round-trip as plain HTML/CSS |
| Object-fit control for sized images | T2 | |
| Video: local file or URL, autoplay/loop/muted/controls | T2 | Descoped 2026-07 (owner) — revisit on request |
| Background video / iframe backgrounds per slide | T2 | Descoped 2026-07 (owner) — revisit on request |
| Audio embed | T3 | |
| iframe embeds (YouTube, maps, live sites) | T2 | Descoped 2026-07 (owner) — revisit on request |
| SVG file insert (as `<img>` or inline) | T2 | Inline preserves CSS targetability |
| Asset manager (list/reuse/delete uploaded assets, orphan detection) | T3 | |

## E. Tables

| Feature | Tier | Notes |
|---|---|---|
| Insert table N×M (size picker grid) | T1 | Plain `<table><thead><tbody>` |
| Cell text editing (full rich-text ops inside cells) | T1 | Scoped contenteditable per cell; Tab/Shift-Tab & arrows navigate cells |
| Add/remove row & column (buttons + row/col hover handles) | T1 | |
| Reorder rows / columns by drag | T2 | |
| Header row / header column toggle | T1 | `<thead>` / `<th scope>` |
| Cell alignment (h/v) per cell/column | T1 | Inline styles or col-level classes |
| Table style presets: borders, striped rows, minimal, theme-accent | T1 | Class-based, backed by the editor-managed style block (see Architecture) |
| Cell fill color, text color | T2 | Shipped — inspector cell colors |
| Column width adjustment by drag | T2 | Shipped — boundary grips; measured colgroup % + fixed layout on first drag |
| Merge / split cells (colspan/rowspan) | T2 | Shipped — logical-grid model; merges only along aligned rects |
| Sort rows by column (one-time authoring action) | T3 | |
| Paste table from TSV/CSV/Excel/Sheets clipboard | T2 | Shipped — new table from stage paste; in-cell TSV distributes and grows rows |
| Convert table → chart | T3 | Feeds the chart data editor |

## F. Charts

Charts are **baked into the deck as inline SVG** at edit time — decks stay standalone with
no chart runtime. The editable spec (chart type, data, options) is stored as JSON on the
element itself (`data-re-chart` attribute), so reopening the deck restores full editability.

| Feature | Tier | Notes |
|---|---|---|
| Chart types: bar (grouped/stacked), line, area, pie/donut, scatter | T1 | |
| Data editor: spreadsheet-like grid (rows × series), add/remove series | T1 | |
| Paste data from CSV/TSV/Sheets into the grid | T1 | |
| Titles, axis labels, legend position, value labels toggle | T1 | |
| Color palette: theme-derived defaults + manual per-series override | T1 | Palette generated from the active reveal theme's colors |
| Number formatting (decimals, %, thousands) | T2 | Shipped — auto / 0–2 decimals / percent / compact, applied to ticks + value labels |
| Horizontal bar, combo (bar+line) | T2 | Shipped — `hbar` type; `combo` with per-series bar/line mark |
| Animate chart in with fragments (per-series reveal) | T3 | Series as separate fragment groups within the SVG |
| Live-data charts (fetch at present time) | T3 | Violates standalone-by-default; explicit opt-in only |
| Edit chart spec as raw JSON (escape hatch) | T2 | Shipped — validated editor in the chart modal |

## G. Shapes & drawing

Shapes are inline `<svg>` elements, absolutely positioned in slide space, with the shape
parameters stored as JSON (`data-re-shape`) for re-editing. They render everywhere without us.

| Feature | Tier | Notes |
|---|---|---|
| Rectangle (w/ corner radius), ellipse, line, arrow | T1 | Draw group on the ribbon |
| Fill, stroke color/width/dash, opacity | T1 | Inspector |
| Two-point lines/arrows: draggable endpoints, heads at either end | T1 | Shipped — normalized endpoints in the spec (docs/DIAGRAMMING.md) |
| Endpoint snapping to box anchors (8 per element) + optional snap gap | T2 | Shipped — drag-time; persistent attachment is the T3 connector item |
| Text label inside shape (centered, editable) | T2 | Shipped — `<foreignObject>` label preserved across re-bakes; click a selected shape and type |
| Shapes gallery: 10 base shapes + 22 flowchart shapes | T2 | Shipped — Google Slides-style grid popover; icons drawn by the shape renderer itself |
| Callout / speech bubble, star, chevron | T2 | Shipped — gallery base section |
| Connector arrows that stay attached to two elements | T3 | Shipped — `data-re-id` refs + pre-commit reconcile (docs/DIAGRAMMING.md phase 4) |
| Freehand / pen | T3 | |
| Rotate + flip — ALL elements (text, images, shapes, charts) | T2 | Shipped incl. rotated local-frame resize — docs/DIAGRAMMING.md "Rotation (editor-wide)" |
| Duplicate with Alt-drag | T2 | Shipped |

## H. Code blocks

| Feature | Tier | Notes |
|---|---|---|
| Insert code block; edit in CodeMirror overlay | T1 | Raw text is truth; hljs display only |
| Language picker, line numbers, `data-trim` | T1 | |
| Step-through line highlights (`data-line-numbers="1-3|4|"`) with visual step builder | T1 | This is reveal's killer code feature — first-class UI |
| Font-size adjustment per block | T2 | |
| Fetch snippet from file/URL at authoring time | T3 | Pasted in, not linked |

## I. Math & special content

| Feature | Tier | Notes |
|---|---|---|
| Preserve existing MathJax/KaTeX markup untouched | T1 | Generic-element passthrough guarantee |
| Insert/edit LaTeX formula with rendered preview | T3 | Requires math plugin in deck; opt-in |
| Emoji / special character picker | T2 | Shipped — searchable popover in the text toolbar, inserts at the caret |
| Icon library (e.g. inline SVG icons) | T2 | Shipped — curated tabler set as inline SVG (currentColor strokes follow the theme) |

## J. Layout & positioning

| Feature | Tier | Notes |
|---|---|---|
| Flow layout by default (reveal's natural centering) preserved | T1 | |
| Free positioning: drag any element → absolute in slide-space px | T1 | Plain inline styles, valid reveal idiom |
| Resize with handles; Shift = aspect lock | T1 | |
| Snap guides: slide edges/center + sibling edges/centers | T1 | |
| Arrow-key nudge (1px / 10px) | T1 | |
| "Return to flow" (strip positioning) | T1 | |
| Z-order: bring forward/backward/front/back | T1 | `z-index` |
| Align & distribute selected elements (left/center/right/top/middle/bottom, equal spacing) | T2 | Shipped |
| Group / ungroup elements | T2 | Shipped — `div.re-group` wrapper |
| Layers panel (element tree of current slide) | T2 | Shipped |
| Layout helpers: columns (`r-hstack`/`r-vstack`), stack (`r-stack`) | T2 | Reveal's own utility classes |
| Configurable slide grid overlay (editor-only) | T2 | Never serialized |
| Smart layout suggestions / auto-layout | T3 | |

## K. Styling & theming

| Feature | Tier | Notes |
|---|---|---|
| Switch between built-in reveal themes | T1 | Rewrites the theme `<link>` href |
| Per-slide backgrounds: color, gradient, image (+size/position/repeat/opacity) | T1 | `data-background-*` |
| Custom user CSS passthrough (existing `<style>`/`<link>` untouched, applied in canvas) | T1 | |
| Editor-managed style block for reusable styles (table presets, shape defaults) | T1 | Single clearly-marked `<style data-revealeditor>` in head; see Architecture |
| Edit deck-level custom CSS in a code editor panel | T2 | CodeMirror on the user's own `<style>` block |
| Theme color/font token overrides (reveal's `--r-*` custom properties) | T2 | Written into the managed style block |
| Custom theme files in workspace | T2 | Any `.css` in workspace selectable as theme |
| Design-system component palette | T3 | Shipped — see §O |
| Per-deck default text styles ("make all H2s look like this") | T3 | Managed style block rules |

## L. Animations

| Feature | Tier | Notes |
|---|---|---|
| Fragments: toggle on any element, all variant effects | T1 | fade-in/out/up/down/left/right, grow, shrink, strike, highlight-*, semi-out… |
| Fragment ordering: panel list + drag reorder (`data-fragment-index`) | T1 | |
| Fragment stepper in editor (preview steps without runtime) | T1 | Class-driven simulation |
| Fragment badges on canvas elements | T1 | |
| Group fragments (multiple elements appear together = same index) | T1 | Falls out of explicit indices |
| Nested fragments (two-stage effects on one element) | T2 | e.g. fade-in then highlight |
| Slide transitions per deck & per slide (+speed) | T1 | `data-transition`, none/fade/slide/convex/concave/zoom |
| Background transitions | T2 | Shipped — `data-background-transition` select in the Slide inspector |
| **Auto-Animate**: toggle per slide pair, automatic element matching preview, manual `data-id` pairing UI, per-element easing/duration/delay | T2 | Partly shipped — per-slide toggle done; matching preview + `data-id` UI + per-element timing remain (ROADMAP §1 c/d/e) |
| "Duplicate slide for auto-animate step" helper | T2 | Shipped — sorter action flags both slides with `data-auto-animate` |
| CSS animation presets on elements (attention effects) | T3 | Must serialize as plain CSS in managed block |

## M. Presenting & speaker workflow

| Feature | Tier | Notes |
|---|---|---|
| Speaker notes editor per slide (rich text) | T1 | `<aside class="notes">`, bottom drawer |
| Live preview pane with real reveal.js runtime, follows edited slide | T1 | Disposable iframe, one-way sync |
| Present mode (opens the real file, exactly what the audience sees) | T1 | |
| Speaker view (reveal notes plugin window) works from Present mode | T1 | Comes free if notes plugin present; ensure template includes it |
| Fragment/step preview inside the preview pane | T1 | |
| PDF export (reveal's `?print-pdf` flow, headless print to file) | T2 | Shipped — see §N |
| Presentation timer/rehearsal | T3 | Reveal plugin territory |

## N. Import / export / publishing

| Feature | Tier | Notes |
|---|---|---|
| Deck is always a standalone HTML file (that IS the export) | T1 | |
| Export / save to PDF | T2 | Shipped — one-click server render (optional playwright dep) with guided-print fallback |
| Export deck + assets as zip | T2 | Shipped — `GET /api/deck/zip` bundles the deck + its referenced local assets (paths preserved); toolbar "ZIP" button. Dependency-free store-only zip writer |
| One-click "bundle offline" (inline/vendor the CDN reveal.js into the deck folder) | T2 | Shipped — `POST /api/deck/bundle` vendors remote `<link>`/`<script>` into `<deckdir>/vendor/` + byte-surgical href rewrite; toolbar "Offline" button. Non-recursive (CSS-internal `url()` not followed) |
| Import from Markdown (file → one slide per `---`) | T2 | Reveal's own markdown conventions |
| Export deck to Markdown (lossy, where possible) | T3 | |
| Publish to GitHub Pages / static host | T3 | |
| Import from PowerPoint/Google Slides | T3 | Explicitly best-effort if ever |

### PDF export plan

reveal.js has first-class print support: loading a deck with `?print-pdf`
switches it to a paginated print layout, and the browser's "Save as PDF"
does the rest. Build on that instead of reinventing pagination:

1. **Phase 1 — guided print (no new dependencies). SHIPPED.** The toolbar
   PDF button saves the deck if dirty, opens `/files/<deck>.html?print-pdf`
   in a new tab, and invokes `window.print()` once reveal's `.pdf-page`
   layout exists (10s timeout fallback). The user picks "Save as PDF" in
   the native dialog; the tooltip reminds about margins: None.
2. **Phase 2 — one-click server-side render (optional dependency).
   SHIPPED.** `POST /api/deck/pdf` drives headless Chromium (playwright,
   resolved at runtime) against the same `?print-pdf` URL and streams back a
   real `.pdf` sized to the deck. Without the dependency the endpoint
   answers 501 and the toolbar button falls back to Phase 1 transparently.

Decks stay standalone throughout — PDF is a render artifact, never a source
format.

## O. Design system (V2 headline)

| Feature | Tier | Notes |
|---|---|---|
| Point editor at design-system folder (`system.css` + `components.html`) | T3 | Shipped |
| Apply design-system stylesheet to a deck (one click) | T3 | Shipped — linked on first component insert |
| Component palette with live mini-renders; insert = generic snippet insert | T3 | Shipped |
| Component instances remain plain HTML (detachable, editable) | T3 | Shipped — copies, not references |
| Brand color/font tokens surfaced in all color/font pickers | T3 | Parsed from system CSS custom properties |
| Slide layout templates from the design system | T3 | Full-slide `<template data-layout>` |

## P. Collaboration & hosting

| Feature | Tier | Notes |
|---|---|---|
| Architecture hostable behind reverse proxy for a small team | T1 | No local-disk assumptions in client; all I/O via API |
| Multi-user editing safety (per-file locking or last-write-wins + conflict UI) | T3 | |
| Auth | T3 | Reverse-proxy auth first |
| Real-time co-editing (CRDT/OT) | Out of scope | Explicitly rejected — conflicts with file-is-truth simplicity |

## Q. Editor platform features (cross-cutting)

| Feature | Tier | Notes |
|---|---|---|
| Undo/redo across all edit types (text, structure, style, slide ops) | T1 | Single app-level history |
| Element clipboard: copy/cut/paste elements within & across slides | T1 | Duplicate = Ctrl+D / Alt-drag |
| Keyboard shortcuts (save, undo, delete, nudge, duplicate, navigation) | T1 | |
| Context menus (right-click on element / slide / sorter) | T2 | Canvas menu shipped; sorter menu open (ROADMAP §6) |
| Configurable toolbar/command system (top panel + floating + context + keyboard from one action registry) | T2 | Shipped — action registry + `.revealeditor.json` overrides ([TOOLBARS.md](TOOLBARS.md)) |
| Raw HTML view/edit of current slide (escape hatch, CodeMirror) | T2 | Power-user trust feature: see & edit exactly what will be saved |
| Multi-select (shift-click, marquee) | T2 | Shipped — both |
| Accessibility of the editor itself (keyboard operability, focus management) | T2 | |
| Warnings panel (broken image links, invalid fragment indices, oversized slides) | T3 | |

---

## V1 definition ("powerful V1")

Everything marked **T1** above. In one sentence: open any reveal deck; manage slides in 2-D;
edit text, images, tables, charts, shapes, and code WYSIWYG at theme fidelity; free-position
anything; full fragments and transitions; notes, live preview, present mode; theme switching
and backgrounds; all with clean round-tripping, undo, and element clipboard.

**T2** items must require no architectural change — only new element handlers, inspector
sections, commands, or panels (see ARCHITECTURE.md §Extension points). Any T2/T3 feature that
would require an architectural change is a design bug to fix now, not later.
