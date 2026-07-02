/**
 * Free positioning: geometry helpers + style writing. All coordinates are
 * slide-space pixels (the iframe's own CSS px — unscaled by the canvas zoom),
 * written as inline styles: plain reveal.js that round-trips cleanly.
 */
import type { StageCtx } from './commands';
import { commit } from './commands';
import { useDeckStore } from '../state/deckStore';
import { ensureManagedBlock } from './managedCss';

export const FREE_CSS_MARKER = '/* re:free */';
/**
 * Centering for pinned (free-layout) sections, as a stylesheet rule — NOT
 * inline: reveal.js overwrites each section's inline `display` to show/hide
 * slides, so inline flex silently dies when presenting. The !important
 * stylesheet rule outranks reveal's plain inline write, and the
 * :not([style*="display: none"]) guard keeps reveal's hiding working.
 */
export const FREE_CSS = `.reveal .slides section[data-re-free]:not([style*="display: none"]) {
  display: flex !important;
  flex-direction: column;
  justify-content: center;
}`;

export interface StylePatch {
  [prop: string]: string | null;
}

/** Merge into el.style; null removes; drops the style attr when emptied. NO commit. */
export function applyStyle(el: HTMLElement, patch: StylePatch): void {
  for (const [prop, value] of Object.entries(patch)) {
    if (value === null) el.style.removeProperty(prop);
    else el.style.setProperty(prop, value);
  }
  if (el.getAttribute('style') === '') el.removeAttribute('style');
}

export function isAbsolute(el: HTMLElement): boolean {
  return el.style.position === 'absolute';
}

/**
 * THE coordinate space: rects relative to the .slides box — the slide
 * origin, which never moves. This is also the pointer/client space inside
 * the stage iframe and the overlay's drawing space (× scale). ALL
 * interactive geometry (drag, resize, snap, marquee, drop) happens here;
 * writeStageRect converts to inline left/top at the write boundary.
 */
export function stageRect(ctx: StageCtx, el: HTMLElement) {
  const origin = (ctx.section.parentElement ?? ctx.section).getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { left: r.left - origin.left, top: r.top - origin.top, width: r.width, height: r.height };
}

/**
 * Stage-coords origin of the box an absolute element's inline left/top
 * resolve against: the padding box of its nearest positioned ancestor (the
 * section itself in the common case — it is always positioned by stage CSS,
 * and by reveal.css in the runtime). Walks ancestors instead of
 * offsetParent: SVG elements (shapes) don't have offsetParent.
 */
function containingOrigin(ctx: StageCtx, el: HTMLElement): { left: number; top: number } {
  const view = ctx.doc.defaultView!;
  let p = el.parentElement;
  while (p && p !== ctx.section) {
    if (view.getComputedStyle(p).position !== 'static') break;
    p = p.parentElement;
  }
  const cb = p ?? ctx.section;
  const r = stageRect(ctx, cb);
  const cs = view.getComputedStyle(cb);
  return {
    left: r.left + (parseFloat(cs.borderLeftWidth) || 0),
    top: r.top + (parseFloat(cs.borderTopWidth) || 0),
  };
}

/**
 * Write a stage-coords position/size as inline styles on an absolutely
 * positioned element, converting to its containing block's space. The single
 * write boundary between stage coordinates and CSS — call it AFTER
 * position:absolute is set so the containing block is the real one.
 */
export function writeStageRect(
  ctx: StageCtx,
  el: HTMLElement,
  rect: { left?: number; top?: number; width?: number; height?: number },
): void {
  const patch: StylePatch = {};
  if (rect.left !== undefined || rect.top !== undefined) {
    const origin = containingOrigin(ctx, el);
    if (rect.left !== undefined) patch.left = `${Math.round(rect.left - origin.left)}px`;
    if (rect.top !== undefined) patch.top = `${Math.round(rect.top - origin.top)}px`;
  }
  if (rect.width !== undefined) patch.width = `${Math.round(rect.width)}px`;
  if (rect.height !== undefined) patch.height = `${Math.round(rect.height)}px`;
  applyStyle(el, patch);
}

/** Convert a flow element to absolute positioning at its current visual spot. */
export function toAbsolute(ctx: StageCtx, el: HTMLElement, designHeight: number): void {
  toAbsoluteAll(ctx, [el], designHeight);
}

/**
 * Convert several flow elements at once, all keeping their visual spots.
 * Rects are measured against the .slides box — the slide origin, which never
 * moves — BEFORE pinning, and all before the first conversion. Neither pre-
 * nor post-pin section-relative rects are safe: pinning moves the section
 * origin (--re-center-top → 0) AND reflows remaining flow content (the
 * pinning flex lets reveal.css's `margin: auto` on tables absorb the free
 * space, shoving siblings to the top). After pinning the section origin IS
 * the slide origin, so slides-relative coordinates apply verbatim.
 */
export function toAbsoluteAll(ctx: StageCtx, els: HTMLElement[], designHeight: number): void {
  const targets = els.filter((el) => !isAbsolute(el));
  if (targets.length === 0) {
    // Nothing to convert, but touching a free element on a legacy-pinned
    // slide is still the moment to migrate its centering to the runtime-
    // proof form and re-sync the flow-children compensations.
    migrateLegacyPin(ctx);
    syncInlineCentering(ctx);
    return;
  }
  const rects = targets.map((el) => stageRect(ctx, el));
  ensureFreeLayoutSection(ctx, designHeight);
  targets.forEach((el, i) => {
    applyStyle(el, {
      position: 'absolute',
      margin: '0',
      'align-self': null, // flex-item alignment is meaningless once absolute
    });
    // Width only — height stays auto so text reflows as content changes.
    const { left, top, width } = rects[i];
    writeStageRect(ctx, el, { left, top, width });
  });
  syncInlineCentering(ctx);
}

/**
 * Pin the section to the slide's design height so absolute coordinates mean
 * the same thing in the runtime (reveal vertically centers content-sized
 * sections). The inline flex centering keeps the REMAINING flow content
 * centered — in the editor and, because it's inline, in the presentation —
 * so pinning is visually a no-op for everything else.
 */
export function ensureFreeLayoutSection(ctx: StageCtx, designHeight: number): void {
  if (!ctx.section.style.height) {
    // center:false decks lay their sections out in block flow from the top —
    // pinning must not impose flex centering on them.
    const center = useDeckStore.getState().meta?.config.center ?? true;
    applyStyle(ctx.section, { height: `${designHeight}px` });
    if (center) {
      ctx.section.setAttribute('data-re-free', '');
      ensureManagedBlock(FREE_CSS_MARKER, FREE_CSS);
    }
    // Pinned sections sit at the slide origin — clear the centering offset
    // so free-position coordinates match the runtime exactly.
    (ctx.section.parentElement as HTMLElement | null)?.style.setProperty(
      '--re-center-top',
      '0px',
    );
    syncInlineCentering(ctx);
  } else {
    migrateLegacyPin(ctx);
  }
}

/**
 * Legacy pinning wrote the flex inline — which reveal.js stomps at runtime
 * (it rewrites sections' inline display to show/hide slides), so those decks
 * silently lost centering when presenting. Migrate to the attribute +
 * managed-CSS form whenever a free-layout action touches the slide.
 */
export function migrateLegacyPin(ctx: StageCtx): void {
  if (!ctx.section.style.height || ctx.section.style.display !== 'flex') return;
  applyStyle(ctx.section, {
    display: null,
    'flex-direction': null,
    'justify-content': null,
  });
  ctx.section.setAttribute('data-re-free', '');
  ensureManagedBlock(FREE_CSS_MARKER, FREE_CSS);
}

/** A pinned section's flex column breaks two block-flow behaviors that
 * reveal decks rely on, so pinning keeps compensating inline styles in sync
 * on the remaining flow children (inline — the presented file matches):
 *  - inline replaced elements (images, shape svgs) lose text-align centering
 *    → align-self: center restores it;
 *  - reveal.css tables carry margin: auto, which is 0 vertically in block
 *    flow but absorbs ALL free space in flex, shoving siblings to the top
 *    → margin: 0 auto pins the block-flow resolution.
 * Idempotent: pinned adds, unpinned strips. */
function syncInlineCentering(ctx: StageCtx): void {
  const view = ctx.doc.defaultView!;
  const cs = view.getComputedStyle(ctx.section);
  // Attribute (or legacy inline flex), not computed display: the managed
  // stylesheet may not have reached the stage document yet at pin time.
  const pinnedFlex =
    !!ctx.section.style.height &&
    (ctx.section.hasAttribute('data-re-free') || ctx.section.style.display === 'flex');
  const centered = cs.textAlign === 'center';
  for (const child of Array.from(ctx.section.children)) {
    const el = child as HTMLElement;
    if (el.style === undefined) continue;
    const flow = el.style.position !== 'absolute';
    const replaced =
      ['IMG', 'VIDEO', 'IFRAME'].includes(el.tagName) || el.hasAttribute('data-re-shape');
    if (replaced) {
      if (pinnedFlex && centered && flow && !el.style.alignSelf) {
        applyStyle(el, { 'align-self': 'center' });
      } else if (!(pinnedFlex && centered) && el.style.alignSelf === 'center') {
        applyStyle(el, { 'align-self': null }); // inert outside flex — keep files clean
      }
    } else if (el.tagName === 'TABLE') {
      if (pinnedFlex && flow && !el.style.margin) {
        applyStyle(el, { margin: '0 auto' });
      } else if (!pinnedFlex && el.style.margin === '0px auto') {
        applyStyle(el, { margin: null }); // block flow resolves auto to this anyway
      }
    }
  }
}

/** Unpin the section when the last freely positioned element left the slide. */
function maybeUnpinSection(ctx: StageCtx): void {
  // No instanceof: iframe-realm elements fail parent-realm class checks.
  const anyAbsolute = Array.from(ctx.section.children).some(
    (c) => (c as HTMLElement).style?.position === 'absolute',
  );
  if (!anyAbsolute) {
    applyStyle(ctx.section, {
      height: null,
      display: null,
      'flex-direction': null,
      'justify-content': null,
    });
    ctx.section.removeAttribute('data-re-free');
  }
}

/**
 * Sized media own their dimensions: for an image/shape/chart the inline
 * width IS its scale, so returning to flow must not strip it. Text-like
 * elements instead shed the width toAbsolute measured onto them.
 */
function isSizedMedia(el: HTMLElement): boolean {
  return (
    ['IMG', 'VIDEO', 'IFRAME'].includes(el.tagName) ||
    el.hasAttribute('data-re-shape') ||
    el.hasAttribute('data-re-chart')
  );
}

/** The style patch that takes an element out of free positioning. */
function flowPatch(el: HTMLElement): StylePatch {
  return {
    position: null,
    left: null,
    top: null,
    ...(isSizedMedia(el) ? {} : { width: null, height: null }),
    margin: null,
    'z-index': null,
  };
}

/** Strip free positioning and return the element to flow layout. */
export function returnToFlow(ctx: StageCtx, el: HTMLElement): void {
  migrateLegacyPin(ctx);
  applyStyle(el, flowPatch(el));
  maybeUnpinSection(ctx);
  syncInlineCentering(ctx);
  commit(ctx);
}

/**
 * Layout-mode drop: move an element INTO a flow container at a position.
 * Strips free positioning (the element rejoins the layout tree) and unpins
 * the section if it was the last free element.
 */
export function placeInFlow(
  ctx: StageCtx,
  el: HTMLElement,
  parent: HTMLElement,
  before: HTMLElement | null,
): void {
  migrateLegacyPin(ctx);
  applyStyle(el, flowPatch(el));
  parent.insertBefore(el, before);
  maybeUnpinSection(ctx);
  syncInlineCentering(ctx);
  commit(ctx);
}

/** Set flex width proportions on a .re-cols container's columns. */
export function setColumnRatios(ctx: StageCtx, colsEl: HTMLElement, ratios: number[]): void {
  const cols = Array.from(colsEl.children).filter(
    (c): c is HTMLElement => (c as HTMLElement).style !== undefined,
  );
  cols.forEach((col, i) => {
    const r = ratios[i] ?? 1;
    applyStyle(col, { flex: r === 1 ? null : `${r} 1 0` }); // default lives in .re-col CSS
  });
  commit(ctx);
}

export function columnRatios(colsEl: HTMLElement): number[] {
  return Array.from(colsEl.children)
    .filter((c): c is HTMLElement => (c as HTMLElement).style !== undefined)
    .map((col) => parseFloat(col.style.flexGrow) || 1);
}

/** Top-level elements intersecting a marquee rect (pointer/slide coords). */
export function marqueeHits(
  ctx: StageCtx,
  rect: { x: number; y: number; w: number; h: number },
): HTMLElement[] {
  return Array.from(ctx.section.children).filter((c): c is HTMLElement => {
    const el = c as HTMLElement;
    if (el.tagName === 'ASIDE' || el.style === undefined) return false;
    const r = stageRect(ctx, el);
    return (
      r.left < rect.x + rect.w &&
      r.left + r.width > rect.x &&
      r.top < rect.y + rect.h &&
      r.top + r.height > rect.y
    );
  });
}

/** Containers an element may be dropped into during layout mode. */
export function isLayoutContainer(el: Element, section: HTMLElement): boolean {
  if (el === section) return true;
  if (!section.contains(el)) return false;
  if (el.closest('pre') || isGroupEl(el)) return false;
  if (el.hasAttribute('data-re-shape') || el.hasAttribute('data-re-chart')) return false;
  return ['DIV', 'TD', 'TH', 'BLOCKQUOTE', 'FIGURE'].includes(el.tagName);
}

export function changeZOrder(ctx: StageCtx, el: HTMLElement, dir: 1 | -1): void {
  const current = parseInt(el.style.zIndex || '0', 10) || 0;
  const next = current + dir;
  applyStyle(el, { 'z-index': next === 0 ? null : String(next) });
  commit(ctx);
}

/* ---------- multi-element operations ---------- */

export type AlignEdge = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';

function unionRect(rects: { left: number; top: number; width: number; height: number }[]) {
  const left = Math.min(...rects.map((r) => r.left));
  const top = Math.min(...rects.map((r) => r.top));
  const right = Math.max(...rects.map((r) => r.left + r.width));
  const bottom = Math.max(...rects.map((r) => r.top + r.height));
  return { left, top, width: right - left, height: bottom - top };
}

/**
 * Align elements: ≥2 align to the selection's bounding box, a single element
 * aligns to the slide. Flow elements are converted to absolute first — align
 * implies free positioning.
 */
export function alignElements(
  ctx: StageCtx,
  els: HTMLElement[],
  edge: AlignEdge,
  design: { width: number; height: number },
): void {
  if (els.length === 0) return;
  toAbsoluteAll(ctx, els, design.height);
  const rects = els.map((el) => stageRect(ctx, el));
  const box =
    els.length >= 2
      ? unionRect(rects)
      : { left: 0, top: 0, width: design.width, height: design.height };
  els.forEach((el, i) => {
    const r = rects[i];
    const target: { left?: number; top?: number } = {};
    if (edge === 'left') target.left = box.left;
    if (edge === 'right') target.left = box.left + box.width - r.width;
    if (edge === 'hcenter') target.left = box.left + (box.width - r.width) / 2;
    if (edge === 'top') target.top = box.top;
    if (edge === 'bottom') target.top = box.top + box.height - r.height;
    if (edge === 'vcenter') target.top = box.top + (box.height - r.height) / 2;
    writeStageRect(ctx, el, target);
  });
  commit(ctx);
}

/** Equal gaps along an axis; needs ≥3 elements. Order comes from position. */
export function distributeElements(
  ctx: StageCtx,
  els: HTMLElement[],
  axis: 'h' | 'v',
  design: { width: number; height: number },
): void {
  if (els.length < 3) return;
  toAbsoluteAll(ctx, els, design.height);
  const items = els
    .map((el) => ({ el, rect: stageRect(ctx, el) }))
    .sort((a, b) => (axis === 'h' ? a.rect.left - b.rect.left : a.rect.top - b.rect.top));
  const first = items[0].rect;
  const last = items[items.length - 1].rect;
  const span =
    axis === 'h'
      ? last.left + last.width - first.left
      : last.top + last.height - first.top;
  const totalSize = items.reduce(
    (n, it) => n + (axis === 'h' ? it.rect.width : it.rect.height),
    0,
  );
  const gap = (span - totalSize) / (items.length - 1);
  let cursor = axis === 'h' ? first.left : first.top;
  for (const it of items) {
    writeStageRect(ctx, it.el, axis === 'h' ? { left: cursor } : { top: cursor });
    cursor += (axis === 'h' ? it.rect.width : it.rect.height) + gap;
  }
  commit(ctx);
}

export const GROUP_CLASS = 're-group';

export function isGroupEl(el: Element): boolean {
  return el.classList.contains(GROUP_CLASS);
}

/**
 * Group: wrap in an absolutely positioned <div class="re-group"> sized to the
 * union box; children are rebased to group-relative coordinates. Plain HTML —
 * groups survive and present anywhere.
 */
export function groupElements(
  ctx: StageCtx,
  els: HTMLElement[],
  design: { width: number; height: number },
): HTMLElement | null {
  if (els.length < 2) return null;
  toAbsoluteAll(ctx, els, design.height);
  const rects = els.map((el) => stageRect(ctx, el));
  const box = unionRect(rects);
  const group = ctx.doc.createElement('div');
  group.className = GROUP_CLASS;
  applyStyle(group, { position: 'absolute' });
  // Insert where the first (topmost in DOM order) member sat.
  const anchor = els
    .slice()
    .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))[0];
  anchor.before(group);
  writeStageRect(ctx, group, box);
  // Members keep their stage rects; the group becoming their containing
  // block is what rebases the written values — no manual math.
  els.forEach((el, i) => {
    group.appendChild(el);
    writeStageRect(ctx, el, { left: rects[i].left, top: rects[i].top });
  });
  commit(ctx);
  return group;
}

/** Ungroup: rebase children back to slide coordinates and unwrap. */
export function ungroupElements(ctx: StageCtx, group: HTMLElement): HTMLElement[] {
  const children = Array.from(group.children).filter(
    (c): c is HTMLElement => (c as HTMLElement).style !== undefined,
  );
  for (const child of children) {
    const r = stageRect(ctx, child);
    applyStyle(child, { position: 'absolute' });
    group.before(child);
    writeStageRect(ctx, child, { left: r.left, top: r.top });
  }
  group.remove();
  commit(ctx);
  return children;
}

/* ---------- snapping ---------- */

export interface SnapResult {
  x: number | null; // guide position in slide space (vertical line)
  y: number | null; // horizontal line
  dx: number;
  dy: number;
}

interface Edges {
  xs: number[];
  ys: number[];
}

/** Candidate snap edges: slide bounds/center + siblings' edges/centers. */
export function snapEdges(ctx: StageCtx, moving: HTMLElement, designW: number, designH: number): Edges {
  const xs = [0, designW / 2, designW];
  const ys = [0, designH / 2, designH];
  for (const el of Array.from(ctx.section.children)) {
    // No instanceof: iframe-realm elements fail parent-realm class checks —
    // it silently skipped EVERY sibling, so only slide bounds ever snapped.
    if (el === moving || (el as HTMLElement).style === undefined) continue;
    if (el.tagName === 'ASIDE') continue;
    const r = stageRect(ctx, el as HTMLElement);
    xs.push(r.left, r.left + r.width / 2, r.left + r.width);
    ys.push(r.top, r.top + r.height / 2, r.top + r.height);
  }
  return { xs, ys };
}

/** Snap a single edge coordinate against candidates (resize gestures). */
export function snapValue(
  v: number,
  candidates: number[],
  threshold: number,
): { v: number; guide: number | null } {
  let best = threshold + 1;
  let out = v;
  for (const edge of candidates) {
    const d = Math.abs(edge - v);
    if (d < best) {
      best = d;
      out = edge;
    }
  }
  return best <= threshold ? { v: out, guide: out } : { v, guide: null };
}

/** Snap a moving rect against edges; returns adjustment + guide lines. */
export function snapRect(
  rect: { left: number; top: number; width: number; height: number },
  edges: Edges,
  threshold: number,
): SnapResult {
  const result: SnapResult = { x: null, y: null, dx: 0, dy: 0 };
  const xCandidates = [rect.left, rect.left + rect.width / 2, rect.left + rect.width];
  const yCandidates = [rect.top, rect.top + rect.height / 2, rect.top + rect.height];

  let bestX = threshold + 1;
  for (const edge of edges.xs) {
    for (const c of xCandidates) {
      const d = Math.abs(edge - c);
      if (d < bestX) {
        bestX = d;
        result.dx = edge - c;
        result.x = edge;
      }
    }
  }
  if (bestX > threshold) {
    result.dx = 0;
    result.x = null;
  }

  let bestY = threshold + 1;
  for (const edge of edges.ys) {
    for (const c of yCandidates) {
      const d = Math.abs(edge - c);
      if (d < bestY) {
        bestY = d;
        result.dy = edge - c;
        result.y = edge;
      }
    }
  }
  if (bestY > threshold) {
    result.dy = 0;
    result.y = null;
  }

  return result;
}
