# Toolbar & Command System — design

A refactoring plan replacing the hardcoded toolbar/menu/shortcut code with one
**action registry** rendered onto multiple configurable **surfaces** (top panel,
floating toolbar, right-click context menu, keyboard), with availability driven
by an explicit **editor context** — the PowerPoint/Figma model.

## Why (current pain)

- `FloatingToolbar` is a monolith of tag/handler conditionals; every new control
  grows it. The insert menu is duplicated in two places. Keyboard shortcuts are
  hand-rolled in `StageFrame` keydown. There is no right-click menu, no top-panel
  formatting (font, size, color), and no way to configure any of it.
- Every upcoming feature (font controls, arrange menu, table quick-ops, component
  insertion) multiplies the conditional mess unless commands become data.

## Core model

### 1. EditorContext — one computed truth about "what is the user on"

```ts
interface EditorContext {
  stage: StageCtx | null;
  selection: HTMLElement | null;
  handler: ElementHandler | null;      // handlerFor(selection)
  session: 'text' | 'code' | 'chart' | null;
  isAbsolute: boolean;                 // selection freely positioned
  cell: HTMLTableCellElement | null;   // selection inside a table
  slide: Slide | null;
  deck: DeckMeta | null;
}
```

Computed by a `useEditorContext()` hook (memoized on `docVersion`) — the ONLY
place that inspects selection state. Surfaces and actions never poke at stores
directly for availability.

### 2. Action — a command as data

```ts
interface Action {
  id: string;                          // 'format.bold', 'insert.image', 'arrange.front'
  title: string;                       // tooltip / menu label
  icon?: TablerIcon;
  kind: 'button' | 'toggle' | 'select' | 'color' | 'number' | 'submenu';
  group: 'file' | 'history' | 'insert' | 'format' | 'arrange' | 'table' | 'slide';

  when(ctx: EditorContext): boolean;   // visible on this context
  enabled?(ctx: EditorContext): boolean; // default: true when visible
  active?(ctx: EditorContext): boolean;  // toggle/press state (bold, align=center)
  value?(ctx: EditorContext): string | number | null;    // select/color/number kinds
  options?(ctx: EditorContext): { value: string; label: string }[];

  run(ctx: EditorContext, value?: unknown): void;  // calls commands.ts — never DOM directly
  shortcut?: string;                   // 'mod+b' — ONE dispatcher replaces hand-rolled keydown
  keepSessionFocus?: boolean;          // mousedown-preventDefault so text sessions survive clicks
}
```

Actions live in `client/src/editor/actions/` (one file per group). The element
handler registry gains an optional `actions?: Action[]` so content types
contribute their own (chart: "Edit data…", table: row/col ops, shape: nothing —
Inspector remains the home for verbose property forms).

### 3. Surfaces — where actions render

| Surface | Component | Config |
|---|---|---|
| **Top panel** | `TopToolbar` — grouped, ribbon-lite, always visible; unavailable actions render disabled (PowerPoint behavior), not hidden, so the UI is stable | `topLayout: string[][]` (action ids; arrays = groups with separators) |
| **Floating toolbar** | follows selection; the quick subset | `floatingLayout: string[][]` |
| **Context menu** | right-click anywhere on the canvas (and later: sorter, inspector); sections by group; unavailable actions hidden (menu convention) | `contextLayout: string[][]` |
| **Keyboard** | no UI — one dispatcher resolves `shortcut` strings against the same availability | derived from actions |

One generic renderer maps `kind` → Mantine control (`ActionIcon`, `Select`,
`ColorInput`, `NumberInput`, `Menu.Item`). Surfaces differ only in chrome and
which config list they read. Configs are plain data — defaults in code, later
overridable from a settings file/localStorage (deferred; the shape allows it).

### 4. Context menu specifics

- `contextmenu` listener in the stage iframe: preventDefault, resolve the target
  element exactly like pointerdown does (select it), map iframe coords → overlay
  coords (× scale), open a Mantine `Menu` at that point via a controlled portal.
- Right-click on empty canvas → slide-scoped sections (insert, paste, slide props).
- Right-click during a text session inside the session element → native browser
  menu stays (spellcheck etc.) — do NOT hijack it.

## New user-facing capabilities riding on this

1. **Font family** (`format.fontFamily`, select): options = "Theme default" +
   families detected from the deck's own CSS (`@font-face` / `font-family`
   declarations in `headStyles` + Google Fonts links) + generic stacks
   (serif/sans/mono). Writes inline `font-family` on the selected element;
   "Theme default" removes it.
2. **Font size** (`format.fontSize`, number+presets): inline `font-size` in `em`
   (relative to theme scale — survives theme switches better than px; px offered
   in the Inspector later).
3. **Text color** (`format.textColor`, color): inline `color`, with the deck's
   design-system tokens surfaced as swatches (ties into FEATURES §O).
4. **Arrange group**: front/back, pin/unpin — promoted from icon soup into a
   proper group with labels in menus.

**Range-level formatting note:** phase 1 applies font/size/color at the element
level (safe, style-attribute based). Applying to a text *selection* inside an
element produces `<span style>` wrappers, which `normalizeInlineMarkup`
currently strips as WebKit droppings. Phase 3 relaxes the normalizer: spans
whose style carries `color|font-family|font-size` are intentional and survive;
only empty/weight-style-only spans (execCommand leftovers) are unwrapped.

## Phases

- **P1 — Core + port (no new features).** EditorContext hook; Action interface +
  registry; generic renderer; shortcut dispatcher (replaces StageFrame keydown
  command block); port every existing floating-toolbar/insert/keyboard command
  to actions; floating toolbar + main toolbar render from configs; delete the
  hardcoded versions. *Pure refactor — behavior identical, verified by the
  existing suites plus new action-availability unit tests (pure functions ×
  synthetic contexts — highly testable).*
- **P2 — Top format panel.** Insert + Format + Arrange groups in the top panel
  with disabled-state behavior; font family/size/color actions (element-level);
  font detection from deck CSS.
- **P3 — Context menu + range formatting.** Right-click surface; normalizer
  relaxation for intentional styled spans; handler-contributed actions (table
  row/col quick ops, chart edit) appear in the menu.
- **P4 (later) — configuration file.** No customization UI. Layout overrides
  come from an editor config file (`.revealeditor.json` in the workspace root,
  served via the API): `{ "toolbars": { "top": [...], "floating": [...],
  "context": [...] } }` — arrays of action ids, unknown ids ignored with a
  console warning. Defaults live in code (`editor/actions/layouts.ts`).

## Testing

- Action availability: table-driven tests — synthetic `EditorContext`s ×
  `when/enabled/active` (pure functions, no DOM).
- Dispatcher: shortcut string → action resolution, session-focus preservation.
- Round-trip: font/size/color writes produce clean inline styles; normalizer
  keeps intentional spans, strips leftovers (extend serializeSlide suite).
- Behavior parity in P1: existing e2e-ish suites must pass unchanged.

## Non-goals

- No floating "mini formatting bar on text selection inside session" beyond what
  exists (revisit after P3 range formatting).
- No per-user cloud settings; config stays local.
- The Inspector remains the home for verbose forms (backgrounds, fragments,
  shape/chart properties) — actions cover *commands*, not property sheets.
