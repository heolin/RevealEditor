# RevealEditor — Architecture

Designed against the full feature catalog in [FEATURES.md](./FEATURES.md), including features
we will build later. The test of this document: every T1/T2 feature maps onto the extension
points below without structural change (§12 shows the mapping).

## 1. Principles

1. **File is truth.** The reveal.js HTML file is the only persistent representation.
   Everything in the editor is a view or a transient working copy of it.
2. **One-way preview.** The real reveal.js runtime only ever runs in disposable iframes fed
   serialized copies. Nothing is read back from an initialized reveal DOM.
3. **Single mutation funnel.** All slide-content mutations go through the command layer.
   Nothing else touches slide DOM. This is what makes undo, dirty-tracking, and re-render
   coherent.
4. **Everything on a slide is an element handled by a handler.** Text, image, table, chart,
   shape, code — all are *element handlers* registered in one registry implementing one
   interface. Adding a content type = adding a handler. This is the core extensibility bet.
5. **Self-describing rich blocks.** A chart/shape/table carries its editable source inside
   its own markup (JSON in a `data-re-*` attribute; plain HTML for tables). Decks stay
   standalone; editability is restored from the file alone.
6. **Unknown markup is sacred.** The generic fallback handler claims anything no handler
   recognizes, allows select/move/delete/fragment, and guarantees byte-preserving
   serialization of its subtree.

## 2. System overview

Three separated concerns (unchanged from the approved base plan):

```
┌────────────────────────────┐     ┌──────────────────────────────────────────┐
│  Server (Node/Express)     │     │  Client (React/Vite)                     │
│  - workspace file I/O      │◄────┤  - deck model (columns/slides, strings)  │
│  - parse5 splice engine    │ API │  - element handler registry              │
│  - static: /files /vendor  │     │  - stage iframe + overlay + inspector    │
│  - asset uploads           │     │  - command layer + history               │
└────────────────────────────┘     └──────────────┬───────────────────────────┘
                                                  │ postMessage (one-way)
                                   ┌──────────────▼───────────────────────────┐
                                   │  Preview harness iframe                  │
                                   │  real reveal.js runtime, disposable      │
                                   └──────────────────────────────────────────┘
```

- **Server** owns round-trip fidelity: parse5 with `sourceCodeLocation` locates byte ranges
  (`div.slides` inner HTML, theme `<link>` href, `<title>`, head insertion point, the
  editor-managed style block); saves splice new bytes into the original file text. Atomic
  writes; mtime-based 409 conflicts.
- **Client** holds the deck model and all editing machinery. reveal.js never initializes
  against it.
- **Preview harness** (`/preview.html`) loads vendored reveal.js + plugins, receives
  `{slidesHtml, theme, extraStylesheets, config}` messages, `Reveal.sync()`s, follows the
  edited slide. Falls back to destroy/reinit on trouble.

## 3. Document model

```ts
type DeckModel = {
  columns: SlideColumn[];             // horizontal axis
  head: DeckHead;                     // read-mostly head facts (see below)
};
type SlideColumn = { id: string; slides: Slide[] };  // >1 slide = vertical stack
type Slide = {
  id: string;                         // nanoid, session-only, never serialized
  attrs: Record<string, string>;      // section attrs: data-background-*, data-transition, data-auto-animate, class…
  html: string;                       // inner HTML of <section>, incl. <aside class="notes">
  originalSource?: string;            // pristine outerHTML from load; dropped on first edit
};
type DeckHead = {
  theme: string;                      // located theme <link>
  title: string;
  stylesheets: string[];              // ALL stylesheet URLs (user CSS + design system later)
  managedCss: string;                 // contents of <style data-revealeditor> ('' if absent)
  config: RevealConfigView;           // read-only parse of Reveal.initialize (width/height/center/…)
};
```

- Parse (`DOMParser`) and serialize are pure functions with round-trip tests — the first
  test suite in the repo. Untouched slides serialize as `originalSource` verbatim.
- **Slide identity is a path concept** (`[columnIdx, slideIdx]`) resolved through ids —
  vertical stacks are first-class from day one (retrofitting nesting touches everything).

### The editor-managed style block

Some features need deck-level CSS the user didn't hand-write: table style presets, theme
token overrides, shape/animation presets. These live in exactly one clearly-marked block:

```html
<style data-revealeditor="managed">/* re:managed — edited by RevealEditor, safe to edit or delete */
.re-table--striped tbody tr:nth-child(odd) { background: rgba(128,128,128,.12); }
:root { --r-heading-color: #e7ad52; }
</style>
```

Rules: created on demand via head splice; the *only* non-`.slides` region the editor ever
writes besides theme href/title; contents are owned rules keyed by class prefix `re-`;
user edits to it are preserved (it is re-emitted, not regenerated — the editor appends/
updates individual rules by selector). A deck with this block deleted still presents fine —
presets degrade, content survives.

### Reveal config access (`Reveal.initialize({...})`)

Read-only in V1 via a tolerant parse (regex/AST peek for `width`, `height`, `center`,
`slideNumber`). The config *script* is never rewritten in V1. T2 features that need config
writes (slide numbering toggle) go through a dedicated, surgical strategy decided then —
candidate: locate the options object literal with the same parse5+acorn location approach
and splice individual properties. The architecture reserves `DeckHead.config` as the single
place config knowledge lives, so the write capability lands in one module.

## 4. The element handler registry — core extensibility

Every piece of slide content is claimed by exactly one handler:

```ts
interface ElementHandler {
  type: string;                        // 'text' | 'image' | 'table' | 'chart' | 'shape' | 'code' | 'media' | 'embed' | 'generic'
  priority: number;                    // match order; 'generic' is priority -Infinity catch-all
  match(el: Element): boolean;         // claims an element (e.g. table → el.tagName === 'TABLE'; chart → el.hasAttribute('data-re-chart'))

  capabilities: {
    move: boolean;                     // draggable to absolute position
    resize: 'none' | 'width' | 'both'; // which handles appear
    textEdit: boolean;                 // double-click opens a text session
    fragment: boolean;                 // may carry fragment classes (default true)
    delete: boolean;                   // default true
  };

  insert?: {                           // appears in the Insert menu / palette
    label: string; icon: string;
    template(ctx: InsertCtx): string;  // HTML snippet; ctx gives theme palette, design size
    afterInsert?(el: Element, ctx: EditorCtx): void;  // e.g. chart: open data editor immediately
  };

  activate?(el: Element, ctx: EditorCtx): EditSession | null;  // double-click behavior
  inspector?(el: Element): InspectorSection[];                 // declarative props panel (see §7)
  decorate?(el: Element, overlay: OverlayCtx): Decoration[];   // canvas-only adornments (fragment badges, chart "edit data" chip)

  // Serialization hooks — display artifacts out, truth back in:
  hydrate?(el: Element, ctx: EditorCtx): void;      // on load into stage: e.g. code → record raw text, apply hljs; chart → verify SVG matches spec
  dehydrate?(clone: Element): void;                 // on serialize (runs on a deep clone): e.g. code → restore raw text; strip display-only children
}
```

Registration is a static list in `client/src/editor/handlers/index.ts` — plugin-shaped
without plugin-loading machinery (that can come later without changing the interface).

**V1 handlers:** `text` (headings, p, li/ul/ol, blockquote), `image`, `table`, `chart`,
`shape`, `code`, `media` (video/audio/iframe — T2 but registered), `generic` (fallback:
select/move/fragment/delete only; subtree untouched).

**Why this shape:** every T2 feature in the catalog that adds content types (icons, math,
embeds, groups) is *only* a new handler. Inspector sections, insert menu, canvas behavior,
and serialization hygiene all derive from the registry — no feature-specific wiring in the
core.

## 5. Edit sessions

An `EditSession` is a modal, scoped editing interaction on one element. Sessions are the
second extension point (handlers create them):

```ts
interface EditSession {
  el: Element;
  commit(): void;      // write result to the element, push history entry
  cancel(): void;
  destroy(): void;     // remove any UI
}
```

- **TextSession** — sets `contenteditable` on the single target element; `beforeinput`
  guards (allow text/format/delete; block native history; plain-text paste); floating format
  toolbar; exit-time local normalization (`b→strong`, `i→em` only when attribute-less,
  unwrap WebKit `span[style]` droppings). Used by text handler, table cells, shape labels,
  notes drawer.
- **CodeSession** — CodeMirror 6 overlay sized to the block; raw text is truth.
- **TableSession** — structural mode for a table: row/col hover handles, add/remove/reorder,
  cell selection; delegates cell content to nested TextSessions; Tab/arrow navigation.
- **ChartSession** — modal chart editor: spreadsheet-like data grid + type/options form +
  live SVG preview; on commit renders final SVG and writes `data-re-chart` spec + SVG
  children.
- **ShapeSession** — lightweight: on-canvas parameter handles (e.g. corner radius drag),
  label TextSession.

Exactly one session active at a time; entering a session for element B commits the session
on element A. Escape cancels/exits. The session manager lives in the editor store.

## 6. Command layer & history

All mutations flow through `commands.ts` — small named functions over live DOM + store:

```
writeStyle(el, patch)          renameElement(el, tag)        insertHtmlSnippet(slideId, pos, html)
setAttr(el|section, k, v|null) toggleFragment(el, variant?)  setFragmentIndices(map)
moveElement / deleteElement / groupElements                  table ops (addRow, removeCol, mergeCells…)
slide ops (add/dup/delete/move, setSlideAttrs)               deck ops (setTheme, setManagedRule)
```

Every command: (1) mutates the live DOM / model, (2) marks the slide dirty (drops
`originalSource`), (3) commits serialized slide HTML to the store, (4) bumps `docVersion`
(drives panel/overlay re-render). Convention enforced by review + lint: no DOM mutation of
slide content outside `commands.ts` and session classes.

**History:** zundo temporal snapshots of `{columns}` (strings — cheap; ~200 cap). One entry
per committed command; text sessions commit debounced (~900 ms idle) + on exit so typing
undoes in chunks. Native contenteditable undo is suppressed everywhere; Ctrl+Z/Y always
drives app history. Undo of an entry touching a non-current slide navigates there first.

**Element clipboard:** copy serializes the selected elements' clean HTML (via dehydrate) to
an internal + system clipboard (`text/html`); paste routes through `insertHtmlSnippet`.
Cross-deck paste works because blocks are self-describing (§1.5); referenced `assets/` URLs
are rewritten/copied on paste into another deck (server asset-copy endpoint, T2).

## 7. Stage, overlay & inspector

**Stage = same-origin `<iframe>`** (not Shadow DOM: reveal themes style `html`/`body`/
`:root` custom properties and load `@font-face`, which don't pierce shadow roots).
StageFrame builds the document: reveal.css + theme CSS + `DeckHead.stylesheets` (a list —
design-system CSS later is just another entry) + managed style block + injected `editor.css`
(force sections visible, hide `aside.notes`, background layer, caret fixes). Structure:
`.reveal > .slides > section.present` at design size with `transform: scale(S)` from a
ResizeObserver; an **unscaled** `#overlay-root` sibling receives React portals for chrome.

**Overlay** (chrome never enters slide DOM): SelectionBox + 8 handles, HoverOutline,
SnapGuides, TextToolbar, session overlays, handler `decorate()` output (fragment badges,
chart chips). Display positions come straight from `getBoundingClientRect()` (already
post-transform); the only manual scale math is pointer deltas (`dxSlide = dxViewport/scale`)
in the drag/resize controller. Drag/resize/snap is our own ~300-line pointer-event
controller (libraries don't understand scale mapping + slide-space style writes).

**Selection model:** click selects nearest direct child of `<section>`; click again drills
in one level (needed for table cells, grouped elements); Escape ascends; shift-click
multi-select; marquee later. Selection is `Element[]` + stable ids in a `WeakMap` (nothing
written to the DOM).

**Inspector is declarative.** Handlers return `InspectorSection[]` — typed field
descriptors (`color`, `number+unit`, `select`, `toggle`, `buttonGroup`, `dataGrid`,
`custom`) with `get(el)`/`set(el, v)` closing over commands. The Inspector renders whatever
the current selection's handler declares, plus always-on sections: Position/Size (when
absolute), Fragment, and — with a slide selected — Slide props (background, transition,
auto-animate, visibility). New handler ⇒ new panel for free.

## 8. Content-type encodings (self-describing blocks)

| Type | Markup on disk | Editable source |
|---|---|---|
| Table | Plain `<table class="re-table re-table--striped">…` | The HTML itself |
| Chart | `<figure class="re-chart" data-re-chart='{"type":"bar","data":…,"options":…}'><svg…/></figure>` | JSON spec in attribute; SVG is baked render |
| Shape | `<svg class="re-shape" data-re-shape='{"kind":"arrow",…}' style="position:absolute;…">…</svg>` | JSON params in attribute |
| Code | `<pre><code class="language-js" data-trim data-line-numbers="1-3|4">escaped text</code></pre>` | Text content (exactly reveal's highlight plugin format) |
| Image | `<img src="assets/x.png" alt="…" style="…">` | The HTML itself |
| Generic | Whatever the user wrote | Untouched |

Chart SVG rendering: a client-side render function `renderChart(spec, themePalette) → SVG
string`, deterministic for a given spec (stable ids, no timestamps/randomness) so re-saving
an untouched chart is diff-clean. Implementation choice (own d3-scale-based renderer vs
ECharts SSR-to-SVG) is deferred to the chart milestone behind this one function signature;
the palette derives from the active theme's CSS custom properties.

## 9. Serialization pipeline

```
slide live DOM ──deep clone──► handler.dehydrate() per element (registry walk)
              ──► strip editor artifacts (contenteditable/spellcheck/data-editor-*/
                   present/fragment-preview classes; empty class=""/style="")
              ──► conservative pretty-print (own ~150 lines: block elems on own lines,
                   2-space indent, inline content on one line, attrs in source order,
                   pre/code/script/style/textarea verbatim)
              ──► slide HTML string (store) ──save──► server splices .slides region
                   (untouched slides emit originalSource bytes)
```

Fragment-preview classes (`visible`, `current-fragment`) are stripped unless present in the
pristine source (whitelist recorded at load).

## 10. Server & API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/decks` | Scan workspace → `[{path, title, mtime, slideCount}]` |
| POST | `/api/decks` | Create from template `{path, title, theme}` |
| GET | `/api/deck?path=` | `{slidesHtml, head:{theme,title,stylesheets,managedCss,config}, mtime, warnings}` |
| PUT | `/api/deck?path=` | `{slidesHtml, theme?, title?, managedCss?, baseMtime}` → splice; 409 on mtime mismatch |
| POST | `/api/deck/assets?path=` | Upload → `assets/` beside deck; returns relative URL |
| POST | `/api/deck/copy-assets` | (T2) copy referenced assets on cross-deck paste |
| GET | `/api/themes` | Built-in + workspace `.css` themes |
| GET | `/api/design-systems` | (T3, reserved) scan for `components.html` conventions |
| GET | `/files/*` | Whole workspace static (images, Present mode, shared CSS) |
| GET | `/vendor/reveal.js/*` | Vendored reveal dist + plugins |
| GET | `/preview.html` | Preview harness shell |

Workspace-relative `?path=`, resolution confined to workspace root, atomic writes.
`deckFile.ts` (parse5 locate + splice + head-insertion point) is the fidelity core and gets
byte-identity fixtures from day one. npm-workspaces monorepo (`server/`, `client/`), dev =
`concurrently` tsx-watch (:4321) + Vite (:5173, proxied), prod = built client served by
server, `npx revealeditor <folder>`.

Directory layout follows the approved base plan, with the editor engine reorganized around
the registry:

```
client/src/editor/
├── registry.ts            # ElementHandler interface + registry
├── handlers/              # text.ts, image.ts, table.ts, chart.ts, shape.ts, code.ts, media.ts, generic.ts
├── sessions/              # TextSession, CodeSession, TableSession, ChartSession, ShapeSession
├── commands.ts            # single mutation funnel
├── StageFrame.tsx         # iframe, theme CSS list, scaling, overlay portal
├── overlay/               # SelectionBox, HoverOutline, SnapGuides, TextToolbar, decorations
├── serializeSlide.ts      # dehydrate walk + sanitize + pretty-print
└── chart/renderChart.ts   # spec+palette → deterministic SVG
```

## 11. Extension points (the contract with the future)

Adding a feature must be one of:

1. **New element handler** (+ sessions/inspector sections it declares) — new content types.
2. **New inspector section** on an existing handler — new properties of existing content.
3. **New command** — new operations (align/distribute, group).
4. **New panel** consuming the store (layers panel, warnings, raw-HTML view).
5. **New managed-CSS rules** — style presets.
6. **New server endpoint** — workflow features (zip export, PDF, publish).
7. **New head-splice region** — only for config writes (slide numbering); isolated in `deckFile.ts`.

If a planned feature fits none of these, the architecture is wrong — fix it before building.

## 12. Feature → architecture mapping (proof of coverage)

| Feature (catalog) | Mechanism |
|---|---|
| Tables incl. row/col ops & styles | `table` handler + TableSession + inspector sections + managed-CSS presets |
| Charts + data editor | `chart` handler + ChartSession + `renderChart` + `data-re-chart` encoding |
| Shapes | `shape` handler + ShapeSession + `data-re-shape` encoding |
| Text color/size/align, r-fit-text | inspector sections on `text` handler (writeStyle / class toggle) |
| Video/audio/iframe embeds | `media` handler (registered day one, built T2) |
| Icons, math insert | future handlers; math *preservation* is the `generic` handler |
| Fragments incl. groups & stepper | fragment capability on all handlers + Fragment inspector + overlay badges + class-driven stepper |
| Auto-Animate UI | Slide inspector (`data-auto-animate`) + a pairing overlay comparing consecutive slides' DOM (reads two slides' HTML from store — no new model) |
| Align/distribute, group | new commands over multi-select |
| Layers panel, raw-HTML view, warnings | new panels over store + `docVersion` |
| Theme token overrides, table presets | managed style block |
| Design-system palette (V2) | `stylesheets` list + `insertHtmlSnippet` + reserved endpoint |
| Slide numbering toggle | isolated config-write in `deckFile.ts` (§3) |
| Zip export, PDF, publish | new server endpoints |
| Team hosting | API-only I/O + reverse proxy; no client changes |

## 13. Testing strategy

- **Round-trip (make-or-break):** fixture corpus of real hand-written decks (weird
  formatting, comments, MathJax, custom CSS). No-edit save is byte-identical. Edited save:
  only touched slides differ; result initializes in reveal.js without console errors.
- **Handler contract tests:** for each handler, `hydrate → dehydrate` is identity on its
  fixtures; dehydrate strips all display artifacts (property-based: serialized output never
  contains `contenteditable`, hljs spans, editor classes).
- **Chart determinism:** same spec + palette → identical SVG string.
- **E2E (Playwright):** open → edit each content type → save → assert file semantics +
  `git diff` locality; undo/redo round-trips; contenteditable golden-file tests per browser.

## 14. Milestones (revised for the full catalog)

- **M0 — Scaffold.** git init, workspaces, server static routes, Vite shell, sample decks.
- **M1 — Open / restructure / save / preview.** Splice engine + fidelity tests, deck list,
  model, 2-D sorter, read-only canvas, preview harness, save/409, new deck. *Usable daily as
  a deck organizer.*
- **M2 — Element framework + text.** Registry, generic + text handlers, StageFrame, overlay,
  selection, TextSession + toolbar, commands + history, clipboard, keyboard shortcuts.
  *The architecture proves itself here.*
- **M3 — Images, code, slide props.** image + code handlers (CodeSession, line-highlight
  step builder), asset upload, Inspector framework, backgrounds, transitions, notes drawer,
  theme switcher. 
- **M4 — Free layout.** Drag/resize/snap controller, absolute positioning, z-order, nudge,
  return-to-flow; fragments complete (variants, ordering, stepper, badges).
- **M5 — Tables.** table handler + TableSession + presets via managed style block + paste
  from TSV/HTML.
- **M6 — Charts & shapes.** renderChart + ChartSession + data grid; shape handler + basic
  shapes; theme-derived palettes. *V1 complete.*
- **M7+ (T2 stream).** media handler, auto-animate UI, align/distribute + groups + layers,
  markdown import, zip/PDF export, config writes, raw-HTML view, custom-CSS panel.
