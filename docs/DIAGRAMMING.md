# Diagramming plan — shapes, connectors, nodes

Goal: make RevealEditor a usable diagramming tool (boxes, labeled nodes,
connectors that snap to them) without breaking the two shape invariants:
the `data-re-shape` JSON is the editable truth and the baked SVG must render
identically everywhere reveal.js runs. Everything below fits the existing
extension mechanisms (ARCHITECTURE §11): actions + layouts, shape spec
fields, overlay affordances, inspector sections, geometry helpers.

Feature tiers referenced from FEATURES.md §G (shapes & drawing).

**Status: Phases 1–4 shipped (2026-07). The Phase 5 backlog remains.**
Coverage: `shapes.test.ts` (renderer determinism vs the legacy renderer,
endpoint box math, reconcile follows/detaches, ref-id minting),
`geometry.test.ts` (named anchor points, 2-D snap), `e2e/diagram.spec.ts`
(Draw group, endpoint drag + anchor snap, snap gap, attach → move box →
arrow follows → detach on manual arrow move, text-box design round-trip).

Phase 4 implementation notes (deltas from the sketch below): the reconcile
pass runs as a `setPreCommitHook` registered by `shapes.ts` on the mutation
funnel (`commands.ts` imports no content modules), plus explicitly inside
move/resize gestures for live feedback. The snap gap lives in the shape's
`snapGap` (both ends), not per-attachment. Endpoints released on an anchor
attach; released free they detach; moving the connector body detaches unless
the target moves in the same gesture (whole-diagram drags stay wired).
Connectors show only endpoint grips when selected — no selection box; a
filled grip means attached.

## Phase 1 — Draw toolbar + real line geometry (foundation)

**1a. Dedicated Draw group.** New ribbon group after the insert group:
`insert.shape.rect`, `insert.shape.ellipse`, `insert.shape.line`,
`insert.shape.arrow` — and `insert.shape.rect` leaves the general insert
group. Pure `layouts.ts` change (actions already exist). When the kind list
grows past ~5 (Phase 5), collapse the tail into one dropdown control
(`customControls.tsx`) so the ribbon stays flat.

**1b. Two-point model for line/arrow.** Spec gains geometry, normalized to
the element box:

```jsonc
{ "kind": "arrow",
  "x1": 0, "y1": 1, "x2": 1, "y2": 0,   // fractions of the box
  "heads": "end" }                       // none | start | end | both
```

- Defaults reproduce today's diagonal exactly → existing decks render
  byte-identically (renderChart-style determinism check in tests).
- Box resize keeps scaling the line (normalized coords make that free);
  whole-element move stays untouched geometry-wise.
- Degenerate boxes (horizontal/vertical lines): box min-size 8px stays;
  endpoints at y=0.5 both. Stroke thicker than the box renders fine because
  the svg has `overflow: visible`… it does not — add stroke padding instead:
  render keeps `viewBox` = box and clamps inset, as today.
- `heads` merges the line/arrow families: an arrow is a line with heads.
  Keep both kinds for insert-menu semantics; the renderer is shared.

**1c. Endpoint handles.** Registry capability `resize: 'endpoints'` for
line/arrow shapes (handler consults the spec kind). `EditorOverlay` renders
two round grips at the endpoints instead of the 8 box handles. Drag =
pointer-capture loop like `ResizeHandles`: new absolute endpoint →
recompute bbox of both endpoints → `writeStageRect` + write normalized
endpoints into the spec → `renderShapeInto` → `commit` on pointer-up
(one undo step per gesture).

## Phase 2 — Anchor snapping (drag-time)

- `anchorPoints(el)` in `geometry.ts`: the 8 box points (4 corners + 4 edge
  midpoints) of a sibling element, in stage coords.
- `snapPoint(p, anchors, threshold)`: 2-D nearest-point snap (the existing
  `snapValue`/`snapRect` are 1-D and stay for box gestures).
- During an endpoint drag, candidates = anchors of every top-level sibling
  (shapes, text boxes, images, tables — anything with a box) + slide
  bounds/center. Overlay shows the candidate dots on the element under the
  pointer (PowerPoint-style) and highlights the snapped one.
- **Snap gap** (the "stop 10px before the anchor" ask): shape spec field
  `snapGap?: number`, default absent = off. When set, a snapped endpoint
  backs off from the anchor along the line direction by that many px.
  Inspector: checkbox + number (suggests 10) in the shape section. Gap is
  applied at snap time in Phase 2 (pure geometry); it becomes persistent
  data in Phase 4.

## Phase 3 — Text boxes as diagram nodes

Inspector "Box" section for `text`-handler elements (and groups): controls
writing plain inline styles — round-trip-clean, presents anywhere:

- background color, padding (the "inner margin"), border width/color,
  corner radius. Optional outer margin for flow layouts.
- With this, a diagram node = one text element with background + padding —
  no rect-plus-label pairing needed, and connectors snap to its box anchors
  via Phase 2 for free.

This also closes FEATURES §C "text box background/padding" independent of
diagramming.

## Phase 4 — Sticky connectors (attachment survives moves)

FEATURES G lists this as T3 ("requires element identity"). Design:

- Identity: `data-re-id` (short nanoid) stamped on an element the first time
  a connector attaches to it. Our namespace, invisible to reveal.
- Connector spec grows `from` / `to`:
  `{ "ref": "<id>", "anchor": "e", "gap": 10 }` (anchor = n/ne/e/se/s/sw/w/nw);
  free endpoints stay as bare coordinates.
- Reconciliation lives in the mutation funnel: after any command that
  changes geometry (`writeStageRect`, text reflow via commit), a pass finds
  connectors on the slide whose refs resolve, recomputes their endpoints
  from the target's current box, re-renders, same commit. No timers, no
  observers — it rides the existing commit path.
- Deleting a referenced element detaches the connector (endpoint keeps its
  last geometry, ref dropped). Undo restores both sides because both are in
  the same slide-HTML snapshot.
- Serialization: refs are just spec JSON + a data attribute — fidelity rules
  unchanged.

## Phase 5 — Diagramming backlog (ordered)

| Feature | Notes | Tier |
|---|---|---|
| Shape text label | **Shipped** — `foreignObject` + flex div, preserved across renderer re-bakes, sized to the box minus 8% padding; activate (click a selected fill shape) starts a text session; empty labels stripped at serialize | T2 |
| Shapes gallery (33 kinds) | **Shipped** — Google Slides-style grid popover: 10 base shapes + 22 flowchart entries (predefined process, document(s), on/off-page connectors, manual op/input, display, merge, collate, sort, delay, storages, card, paper tape, junctions, …). Icons are drawn by `shapeInnerSvg` — the pure renderer core shared with the live render, so previews always match output. | T2 |
| More kinds: callout, chevron, star | **Shipped** — base section of the gallery | T2 |
| Connector label | **Shipped** — double-click a connector; foreignObject on the route midpoint, svg overflow visible | T2 |
| Elbow (orthogonal) connectors | **Shipped** — `route: 'elbow'`, HVH/VHV routing; `bend` spec field dragged via the square mid grip | T2 |
| Flip / rotate | Superseded by the editor-wide plan below — applies to every element, not just shapes | T2 |
| Alt-drag duplicate | **Shipped** — clones stay behind (fresh ids), the drag moves the originals | T2 |
| Style memory | **Shipped** — session-scoped, per kind | T2 |
| Curved (bezier) connectors | **Shipped** — `route: 'curve'` + `bow` in the spec; square mid grip bows the curve through the pointer | T3 |
| Freehand / pen | FEATURES G T3 | T3 |

## Rotation (editor-wide) — R1–R3 shipped (incl. rotated resize + flip)

Rotate ANY element — text boxes, images, shapes, charts, tables, groups —
not just shapes. Design:

**Representation.** Inline `transform: rotate(Ndeg)` (integer degrees) on the
element — one uniform mechanism for every handler type, plain CSS that
presents anywhere and round-trips clean. Not a shape-spec field: shapes
rotate by the same rule as everything else (`renderShapeInto` never touches
`transform`). The editor only ever *parses and rewrites the exact
`rotate(Ndeg)` form*; an element carrying any other transform (hand-authored
matrix/scale) is opaque — rotation UI hides rather than risk rewriting
markup we don't understand. Rotating a flow element converts it to absolute
first (same rule as align/drag — rotation implies free positioning).
Rotation happens around the element center (the CSS default), which
getBoundingClientRect conveniently preserves.

**Measurement model.** getBoundingClientRect on a rotated element returns
the axis-aligned bounding box (AABB). The unrotated box is derivable without
touching the DOM: layout size (`offsetWidth/offsetHeight` — unaffected by
transform) centered on the AABB center. `stageRect` keeps returning what it
returns; a new `unrotatedRect(el)` + `rotation(el)` pair feeds the overlay.
Move drags are unaffected (left/top translate the box under the rotation).
Snapping and marquee keep using the AABB (what PowerPoint does).

**Phases:**

- **R1 — core.** `rotation(el)` / `setRotation(ctx, el, deg)` in geometry;
  a rotation grip floating above the selection (drag = angle from center;
  soft-snap to the 45° cardinals within ~3°, Shift = strict 15° steps;
  angle badge while dragging; commit on release); "Rotation" field in the
  inspector Position section. The selection box + handles render inside one
  rotated overlay wrapper so chrome hugs the element, not its AABB. Resize
  handles HIDE while rotated (inspector width/height still work) — correct
  rotated resize is R2, and wrong resize is worse than none.
- **R2 — rotated resize.** Project the pointer delta into the element's
  local frame, resize there, pin the opposite corner/edge in world space
  (standard local-frame algorithm, ~30 lines). Aspect lock unchanged.
- **R3 — integration.** `anchorPoints` rotates the 8 anchors around the
  center when the target is rotated, so connectors snap to and track TRUE
  corners of rotated nodes (reconcile picks this up for free). Flip H/V as
  `scaleX(-1)`/`scaleY(-1)` composed into the same managed transform string.

**Known interaction — fragments.** Both reveal's movement fragment variants
(fade-up/down/…: stylesheet `transform: translate(…)`) and the stage's
fragment neutralizer (`transform: none !important`) collide with an inline
rotation. Resolution: narrow the stage rule to
`.fragment:not([style*="transform"])`, and accept that a rotated fragment
loses its movement offset at runtime too (inline beats non-important
stylesheet rules — consistently in editor and presentation). Fade/opacity
variants are unaffected. The inspector can nudge: movement variants shown as
degraded for rotated elements.

**Test expectations.** Unit: rotation parse/write round-trip incl. refusing
foreign transforms; unrotatedRect math; rotated anchorPoints. E2E: rotate a
text box via the grip → style contains rotate → save/reload keeps it; rotate
a diagram node with an attached arrow (R3) → endpoint tracks the rotated
corner; resize hidden while rotated (R1) / works in local frame (R2).

## Test expectations

- Determinism: same spec + size → identical SVG string (extend the existing
  render tests; old specs without endpoint fields must render byte-identical
  to today's output).
- Hydrate→dehydrate identity on fixture decks with connectors.
- E2E: insert arrow → drag endpoint onto a text box anchor → move the box →
  (Phase 4) connector follows; save; reopen; still attached.
