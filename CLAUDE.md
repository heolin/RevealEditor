# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A WYSIWYG editor for reveal.js presentations. The reveal.js HTML file on disk is the **only source of truth** — the editor opens existing hand-written decks, edits them visually, and saves back clean HTML. No lock-in: untouched slides must save byte-identical, and markup the editor doesn't understand is never rewritten.

`docs/ARCHITECTURE.md` is the authoritative design document (principles, extension points, feature→mechanism mapping) — read it before structural changes. `docs/FEATURES.md` is the feature catalog with tiers; `docs/ROADMAP.md` plans all still-open items (mechanism sketches per feature); `docs/TOOLBARS.md` covers the action-registry design. Note the directory sketch in ARCHITECTURE §10 is slightly aspirational — see actual layout below.

## Commands

npm-workspaces monorepo: `server/` (Express + parse5 splice engine) and `client/` (React/Vite editor).

```bash
npm run dev          # server (tsx watch, :4321, serves ../demo-workspace) + client (Vite, :5173, proxied)
npm run build        # client (tsc + vite) then server (tsc)
npm test             # vitest in server then client
npm run typecheck    # tsc --noEmit in both workspaces
npm run test:e2e     # builds, then Playwright against built app on :4340
```

Single test file: `npx vitest run src/lib/deckFile.test.ts -w server` (or `-w client` with a client path). E2E lives in `e2e/editor.spec.ts` and runs against a disposable copy of `demo-workspace/` (`.e2e-workspace`), serial (`workers: 1`); single e2e test via `npx playwright test -g "<name>"` after `npm run build`.

`demo-workspace/` holds sample decks used by the dev server — its files get modified when you edit and save in the dev UI.

## Architecture (big picture)

Three separated concerns:

1. **Server** (`server/src/`) owns round-trip fidelity. `lib/deckFile.ts` is the fidelity core: parse5 with `sourceCodeLocation` locates byte ranges (`div.slides` inner HTML, theme `<link>`, `<title>`, managed style block) and *splices* new bytes into the original file text — never re-serializes the whole document. Atomic writes, mtime-based 409 conflicts. Routes in `routes/` (decks, assets, themes); `lib/workspace.ts` confines path resolution to the workspace root.

2. **Client** (`client/src/`) holds the deck model and all editing machinery. The deck model (`model/deck.ts`, store in `state/deckStore.ts`) is columns → slides where each slide is an HTML *string* plus attrs; untouched slides keep `originalSource` and serialize verbatim. reveal.js never initializes against editor DOM.

3. **Preview harness** (`/preview.html`) — the real reveal.js runtime runs only in disposable same-origin iframes fed serialized copies via postMessage, one-way. Nothing is read back from an initialized reveal DOM.

### Client editor engine (`client/src/editor/`)

- **Element handler registry** (`registry.ts`) — every piece of slide content is claimed by exactly one handler (`text`, `chart`, `shape`, `table`, `code`, `image`, `generic` fallback) via priority-ordered `match()`. Handlers declare capabilities (move/resize/textEdit/fragment), hydrate/dehydrate hooks, and inspector sections. Adding a content type = adding a handler; handlers are defined inline in `registry.ts` (not a `handlers/` dir).
- **Single mutation funnel** (`commands.ts`) — **all slide-content DOM mutations go through here** (plus session classes like `TextSession.ts`). Every command mutates live DOM, marks the slide dirty (drops `originalSource`), commits serialized HTML to the store, and bumps `docVersion`. This convention is what keeps undo, dirty-tracking, and re-render coherent — do not mutate slide DOM elsewhere.
- **Stage** (`StageFrame.tsx`, `stageDoc.ts`) — same-origin iframe (not Shadow DOM; themes style `:root`/`body`) rendering one slide at design size with `transform: scale(S)`. An unscaled `#overlay-root` sibling receives React portals for all editor chrome (`overlay/EditorOverlay.tsx`) — chrome never enters slide DOM. Positions come from `getBoundingClientRect()`; the only manual scale math is pointer deltas (`geometry.ts`).
- **Action registry** (`actions/`) — commands as data (`Action` with `when(ctx)`/`enabled(ctx)`/`run`), computed against a single `EditorContext` (`actions/context.ts`), rendered onto surfaces (toolbar, floating toolbar, context menu, keyboard). New commands should be actions, not hardcoded toolbar buttons.
- **Serialization** (`serializeSlide.ts`) — deep clone → per-element `dehydrate()` → strip editor artifacts → conservative pretty-print. Serialized output must never contain `contenteditable`, hljs spans, or editor classes.
- **History** — zundo temporal snapshots of slide HTML strings; text sessions commit debounced. Native contenteditable undo is suppressed everywhere.
- **Edit sessions** — modal scoped editing (TextSession, CodeModal, chart/table editors); exactly one active at a time, entering one commits the previous.

### Self-describing rich blocks

Charts/shapes carry their editable source in `data-re-chart` / `data-re-shape` JSON attributes; the SVG children are baked renders (`chart/renderChart` must be deterministic — same spec + palette → identical SVG string, so unedited charts are diff-clean). Tables and images are plain HTML. Editor-generated deck-level CSS lives only in the `<style data-revealeditor="managed">` block.

### Custom-deck invariants (§12b of ARCHITECTURE.md)

- Deck `<style>` blocks outside `.slides` (`DeckHead.headStyles`) are first-class design and must be injected into canvas and preview.
- `theme: null` means inject *no* theme anywhere and disable theme switching.
- `center: false` decks use block layout in the canvas; free-layout pinning must not impose centering.

## Testing expectations

Round-trip fidelity is make-or-break: no-edit save must be byte-identical (fixtures in `server/test/fixtures/`, including `benchmarks.html`, a real fully-custom deck kept as a permanent fixture). Handler changes need hydrate→dehydrate identity on fixtures. Unit tests sit next to their modules (`*.test.ts`).

## Extension points

Adding a feature must fit one of the mechanisms in ARCHITECTURE.md §11 (new action, new handler, new inspector section, new command, new panel, new managed-CSS rule, new server endpoint, new head-splice region). If it fits none, the architecture needs fixing first — don't bolt on feature-specific wiring in the core.
