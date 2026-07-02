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

## What it does (V1)

- **Slides**: 2-D sorter (horizontal + vertical stacks), add/duplicate/delete/reorder by
  drag, hidden-slide badge, copy/paste slides' elements across slides
- **Text**: in-place WYSIWYG at theme fidelity — click to select, click again to edit;
  bold/italic/strike, links, headings, lists, alignment; plain-text paste
- **Content**: images (upload or URL), code blocks (CodeMirror editor, reveal's
  step-by-step line highlights), tables (cell editing, row/column ops, header toggle,
  style presets), charts (data grid + CSV paste, baked as standalone SVG with the
  editable spec in `data-re-chart`), shapes (rect/ellipse/line/arrow)
- **Layout**: drag anything to position it freely (plain inline styles — valid reveal),
  resize with snap guides, z-order, arrow-key nudge, back-to-layout
- **Presenting**: fragments (variants, ordering, in-editor step preview), per-slide
  backgrounds and transitions, speaker notes, live preview with the real reveal runtime,
  Present opens the actual file
- **Fidelity**: untouched slides are saved byte-identical; comments travel with their
  slides; hand-written markup the editor doesn't understand is never rewritten;
  fully custom-styled decks (no standard theme) are supported

## Documentation

- [docs/FEATURES.md](docs/FEATURES.md) — feature catalog with priority tiers
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system architecture, element handler
  registry, extension points, real-deck compatibility learnings

## Development

```bash
npm test            # round-trip fidelity + editor unit suites
npm run typecheck
npm run build
```

Repository layout: `server/` (Express, parse5 splice engine, workspace API),
`client/` (React/Vite editor), `demo-workspace/` (sample decks for development).
