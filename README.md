# RevealEditor

A WYSIWYG editor for [reveal.js](https://revealjs.com/) presentations. The reveal.js HTML
file on disk is the only source of truth — open existing hand-written decks, edit them
visually, save back clean HTML. No lock-in, git-friendly diffs, decks stay standalone.

## Quick start

```bash
npm install
npm run dev          # editor UI on http://localhost:5173, API on :4321
```

The dev server opens the `demo-workspace/` folder. To edit your own presentations:

```bash
npm run build
node server/dist/index.js ~/path/to/your/talks --port 4321
# then open http://localhost:4321
```

Any `.html` file containing a reveal.js `div.slides` is picked up automatically.

You can also switch folders from the deck list at runtime — off by default;
enable with `--allow-workspace-change`, or copy `revealeditor.config.example.json`
to `revealeditor.config.json` and set `"allowWorkspaceChange": true`. Keep it
**off** when hosting. See
[Choosing a workspace folder](docs/USAGE.md#choosing-a-workspace-folder).

New here? The [user guide](docs/USAGE.md) walks through editing a deck end to end.

## What it does

- **Slides**: 2-D sorter (horizontal + vertical stacks), add/duplicate/delete/reorder by
  drag, hidden-slide badge, jump-to-slide search, copy/paste slides across decks
- **Text**: in-place WYSIWYG at theme fidelity — click to select, click again to edit;
  bold/italic/strike, links, headings, lists, alignment, text/highlight color, font size
  and family, emoji & icon pickers, `r-fit-text`; plain-text paste
- **Tables**: cell editing, add/remove rows & columns, header toggle, alignment, cell
  colors, drag column resize, merge/split cells, TSV/CSV paste, style presets
- **Charts**: bar (grouped/stacked), horizontal bar, line, area, pie/donut, scatter and
  combo; data grid + CSV paste, number formatting, theme palettes — baked as standalone
  SVG with the editable spec kept in `data-re-chart` (raw-JSON escape hatch)
- **Shapes & diagrams**: shapes gallery (base + flowchart), fill/stroke/dash/opacity,
  two-point connectors that snap to box anchors and stay attached, shape labels,
  rotation & flip on every element
- **Images & code**: images (upload/paste/URL) with border/radius/shadow; code blocks in
  a CodeMirror editor with reveal's step-by-step line highlights
- **Layout**: drag anything to position it freely (plain inline styles — valid reveal),
  resize with snap guides, arrow-key nudge, z-order, align & distribute, group/ungroup,
  layers panel, back-to-flow
- **Animations**: fragments (variants, ordering, in-editor step preview, group reveal),
  per-slide & background transitions, **auto-animate** with a duplicate-for-step helper
- **Presenting & export**: speaker notes, live preview with the real reveal runtime,
  Present opens the actual file; export to **PDF**, **zip** (deck + assets), and
  **bundle offline** (vendor the CDN reveal.js for airgapped presenting)
- **Fidelity**: untouched slides are saved byte-identical; comments travel with their
  slides; hand-written markup the editor doesn't understand is never rewritten;
  fully custom-styled decks (no standard theme) are supported

## Documentation

- [docs/USAGE.md](docs/USAGE.md) — user guide (task-oriented walkthrough)
- [docs/FEATURES.md](docs/FEATURES.md) — feature catalog with priority tiers
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system architecture, element handler
  registry, extension points, real-deck compatibility learnings
- [docs/DIAGRAMMING.md](docs/DIAGRAMMING.md) · [docs/TOOLBARS.md](docs/TOOLBARS.md) ·
  [docs/ROADMAP.md](docs/ROADMAP.md)

These also render as a browsable site (landing page + docs) published to GitHub Pages by
`.github/workflows/pages.yml`. Build it locally with `npm run build:site` and open
`_site/index.html`.

## Development

```bash
npm test            # round-trip fidelity + editor unit suites
npm run typecheck
npm run build
```

Repository layout: `server/` (Express, parse5 splice engine, workspace API),
`client/` (React/Vite editor), `demo-workspace/` (sample decks for development).
