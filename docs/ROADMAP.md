# Roadmap — remaining T2/T3 work, planned for later

Everything T1/T2 in the diagramming, tables, charts, workspace, text, and
export areas shipped in 2026-07 (see FEATURES.md for the per-row status and
docs/DIAGRAMMING.md for the diagram subsystem's history). This document
plans what is left so a future session can pick any block up cold: each item
names its **mechanism** in terms of the extension points in ARCHITECTURE §11
(action / handler / inspector section / command / panel / managed-CSS rule /
server endpoint / head-splice region). Nothing here requires new
architecture; if an item ever seems to, fix the architecture first.

Suggested next blocks, in value order: **Animations (auto-animate)** (phases
a/b/background-transition shipped 2026-07; matching-preview + per-element
timing remain) → **Import/export (Markdown, zip, offline bundle)** →
**Theming (token overrides, custom CSS panel)** → the long tail.

## 1. Animations (the biggest missing user-visible feature)

| Item | Plan |
|---|---|
| **Auto-Animate** | The headline. **(a) SHIPPED** — Slide inspector `data-auto-animate` toggle (`setSectionAttr`, serialized as `data-auto-animate="true"`). **(b) SHIPPED** — "Duplicate for auto-animate step" sorter slide-action (`duplicateSlideForAutoAnimate`) copies the slide and flags BOTH original and copy with `data-auto-animate`; the live preview already morphs between them since the preview harness runs real reveal. Remaining: (c) Matching preview: reveal matches elements by content/`data-id`; the editor can render BOTH sections off-screen and diff element identity the same way reveal does, then overlay badges connecting matched pairs. (d) Manual pairing: inspector field writing `data-id` on the selected element (`data-id` already survives serialization — not a `data-re-*` attr — so no allowlist change needed). (e) Per-element `data-auto-animate-easing/duration/delay` attrs in the inspector. (c) is the only hard part. |
| Nested fragments | Reveal supports multiple `fragment` classes via wrapper spans or `data-fragment-index` reuse. Editor: allow a SECOND fragment effect on one element by wrapping content in a `<span class="fragment highlight-red">` — extend the Fragment inspector section with an "add second stage" control. Serializes as plain markup. |
| ~~Background transitions~~ **SHIPPED** | `data-background-transition` select in the Slide inspector, next to the transition select. Reuses `TRANSITIONS` + `setSectionAttr`. |
| CSS animation presets (attention effects) | Managed-CSS rule block (`/* re:attention */`) with a few keyframe presets; per-element class + inspector select. Presets must be presentation-safe (run on fragment reveal or slide entry via reveal's `.present` scoping). |

## 2. Import / export / publishing

| Item | Plan |
|---|---|
| Import from Markdown | Server endpoint `POST /api/decks/import-md`: split on `---` / `--` (reveal's own conventions), render each block to a `<section>` with a tiny MD renderer (marked is fine as a server dep), pour into the new-deck template. One dialog on the deck list ("New from Markdown…"). Decks stay plain HTML afterwards — the import is a converter, not a binding. |
| ~~Export deck + assets as zip~~ **SHIPPED** | `GET /api/deck/zip` walks the deck's referenced local assets (relative `src`/`href`/`poster`/`data-background-image`/`srcset`/CSS `url()`, `lib/deckAssets.ts`) and streams a `.zip` whose layout mirrors the on-disk tree relative to the deepest shared ancestor, so every relative href still resolves after unpacking. Assets outside the workspace, missing files, and remote URLs are skipped. Dependency-free store-only writer (`lib/zip.ts`) — no `archiver`, deterministic output — chosen to keep the server's four-dep footprint. Toolbar "ZIP" button next to PDF. |
| ~~One-click "bundle offline"~~ **SHIPPED** | `POST /api/deck/bundle` downloads the deck's remote `<link rel=stylesheet>` / `<script src>` resources into `<deckdir>/vendor/<host>/<path>` (Node global `fetch`, 20s/25MB caps, http(s) only, workspace-confined) and rewrites each href/src in place via `rewriteResourceRefs` — byte-surgical, reusing the same value-range splice as the theme swap (`resourceRefs` + `attrValueRange` in `deckFile.ts`). Idempotent; failed downloads keep their remote href (partial bundle, reported). Toolbar "Offline" button. Pairs with zip export → airgapped package. **Limitation:** non-recursive — assets referenced from *inside* vendored CSS (`@import`, `url()` fonts) still load remotely. |
| Export to Markdown (lossy) | Walk sections; headings/paragraphs/lists/code/images map cleanly, everything else embeds as raw HTML blocks (reveal-md convention). Low priority; document the loss. |
| Publish to GitHub Pages | Out of editor scope until asked again: the honest v1 is zip export + documented `gh-pages` steps. If built: server shells out to git; needs auth thinking. |
| Import from PowerPoint | Explicitly best-effort if ever. Do not start without a concrete corpus of decks to test against. |

## 3. Theming & layout

| Item | Plan |
|---|---|
| Theme token overrides (`--r-*`) | Inspector Deck section grows a "Theme tweaks" group: heading font, body font, accent color, background — each writes reveal's documented custom properties into the managed style block (`:root { --r-heading-font: … }`). The pickers already exist (ReColorInput, font options). This is the highest-value theming item. |
| Edit deck custom CSS in a panel | CodeMirror (already a dep for the code modal) over the deck's OWN first `<style>` block (headStyles[0]) — needs a new head-splice region for user style blocks (server: locate + replace range, like managedCss but for the user's block). Escape-hatch feature; pairs with the raw-HTML slide view below. |
| Custom theme files in workspace | `listThemes` (server) already scans built-ins; extend to include workspace `*.css` files under a `themes/` convention and write relative hrefs through the existing theme splice. Small. |
| Per-deck default text styles | "Make all H2s look like this": read the selected element's inline styles, write them as a managed-CSS rule (`.reveal h2 { … }`), then STRIP the inline copies deck-wide. Needs a confirmation UX; medium. |
| Layout helpers (`r-hstack`/`r-vstack`/`r-stack`) | Insert actions emitting reveal's own utility classes; the editor's layout mode already handles children. Small. |
| Grid overlay | Editor-only: a toggle (view group) rendering a spaced grid in the overlay; optional snap candidates from grid lines feeding the existing `snapEdges`. Never serialized. |
| Smart auto-layout | T3 research toy; skip until there's a concrete design. |

## 4. Tables & charts extras

| Item | Plan |
|---|---|
| Row/column drag reorder | Overlay grips on row/column headers of the selected table (same pattern as ColumnResizeGrips); drop = splice `<tr>`s / per-row cell moves through the logical grid (merged cells refuse crossing moves, like canMerge). |
| Sort rows by column | Context-menu action on a cell: one-time `<tr>` reorder by that column's text/number value. Small. |
| Convert table → chart | Action on a selected table: read the grid (first row = series, first column = labels — same shape as `parseDelimited`), open the chart modal pre-filled, replace or insert-after. |
| Chart fragments (per-series reveal) | Render each series into its own `<g class="fragment">` inside the baked SVG — reveal fragments work on SVG groups. Renderer flag in options; keep determinism. |
| Live-data charts | Violates standalone-by-default; only with an explicit per-chart opt-in embedding a fetch script. Do not build speculatively. |

## 5. Media & assets *(video/iframe embeds descoped 2026-07-04 by owner — revisit only on request)*

| Item | Plan |
|---|---|
| SVG file insert | Extend the image insert control: `.svg` files offer "as `<img>`" (default) or "inline" (fetch + sanitize + insert markup; keeps CSS targetability). |
| Image border/radius/shadow presets | The BoxFields treatment for `<img>`: reuse the exact same inspector group (border pickers + radius) plus 2–3 shadow presets as inline styles. Small. |
| Object-fit control | Select (cover/contain/fill) writing `object-fit` + explicit height. Small. |
| Crop | Wrapper `<div style="overflow:hidden">` + negative-margin/size on the img; needs its own overlay gesture (crop handles). Medium; design the wrapper round-trip carefully (undo of the wrapper must restore the bare img). |
| Audio embed | `<audio controls>` insert + inspector attrs. Tiny, low demand. |
| Asset manager | Panel listing `assets/` with usage counts (scan deck sources for references), delete-unused. Server: list endpoint; client: modal. |

## 6. Editor platform & workspace tail

| Item | Plan |
|---|---|
| Find & replace across deck | Store-level: search `slide.source` strings (the search box already matches; replace = string ops on sources + one undo entry per replace-all via a store action). UI: extend the sorter search with a replace row. |
| Raw HTML view of current slide | CodeMirror modal showing `serializeSlide(section)` output; apply = validate (single `<section>` root) + `updateSlideSource`. The trust feature — show exactly what will save. |
| Sorter section dividers | Editor-only metadata problem → HTML comments in the slides region (`<!-- re-section: Name -->` in a column's `leading`). Parser already round-trips leading text; sorter renders a label row when it sees the marker. |
| Deck templates gallery | A `templates/` folder in the workspace; "New presentation" dialog lists them (server: reuse deck-list scan) and copies the file. Small. |
| Multiple workspaces | CLI accepts several roots / a recent-workspaces JSON in `~/.config`; deck list gets a workspace switcher. Medium; touches path safety — every `ws.resolve` audit applies. |
| Sorter context menu | Right-click on a thumb: duplicate/delete/copy/paste/hide — same actions the hover buttons expose. Small. |
| Warnings panel | On-demand lint pass over slide sources: broken local image hrefs (HEAD via server), duplicate `data-fragment-index`, elements outside slide bounds (measure via thumbnail iframes). Panel in the right column. |
| Editor accessibility | Audit pass: focus traps in modals (Mantine mostly covers), keyboard-only element selection (arrow-key traversal of slide elements), ARIA labels on the remaining icon buttons. Continuous, not a feature. |
| Design-system: brand tokens in pickers | Parse `--*-color*`/font custom properties from the applied system CSS; feed them into ReColorInput's swatch groups and fontOptions. The palette/apply/insert parts of §O already shipped. |
| Design-system: slide layout templates | `<template data-layout>` in `components.html` → "New slide from layout" in the sorter. Same palette machinery, whole-section snippets. |
| Presentation timer / rehearsal | Reveal plugin territory — a speaker-view concern, not an editor one. Revisit only if presenting workflows move in-app. |
| Freehand / pen | New shape kind storing simplified points in the spec; pointer capture + point thinning (Ramer–Douglas–Peucker) → `<path>`. Fun, rarely asked for. |
| Collaboration / auth | Reverse-proxy auth first (documented), then per-file locking via the existing mtime machinery (a `lock` endpoint + banner reusing the external-change UI). Design before building. |
