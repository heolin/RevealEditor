/**
 * Free positioning: geometry helpers + style writing. All coordinates are
 * slide-space pixels (the iframe's own CSS px — unscaled by the canvas zoom),
 * written as inline styles: plain reveal.js that round-trips cleanly.
 */
import type { StageCtx } from './commands';
import { commit } from './commands';
import { useDeckStore } from '../state/deckStore';

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

/** Rect of an element relative to the slide section, in slide-space px. */
export function slideRect(ctx: StageCtx, el: HTMLElement) {
  const s = ctx.section.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { left: r.left - s.left, top: r.top - s.top, width: r.width, height: r.height };
}

/**
 * Convert a flow element to absolute positioning at its current visual spot.
 * The rect is measured BEFORE the section is pinned — pinning must never
 * move the element being grabbed.
 */
export function toAbsolute(ctx: StageCtx, el: HTMLElement, designHeight: number): void {
  if (isAbsolute(el)) return;
  const rect = slideRect(ctx, el);
  ensureFreeLayoutSection(ctx, designHeight);
  applyStyle(el, {
    position: 'absolute',
    left: `${Math.round(rect.left)}px`,
    top: `${Math.round(rect.top)}px`,
    width: `${Math.round(rect.width)}px`,
    margin: '0',
  });
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
    applyStyle(ctx.section, {
      height: `${designHeight}px`,
      ...(center
        ? { display: 'flex', 'flex-direction': 'column', 'justify-content': 'center' }
        : {}),
    });
  }
}

/** Strip free positioning and return the element to flow layout. */
export function returnToFlow(ctx: StageCtx, el: HTMLElement): void {
  applyStyle(el, {
    position: null,
    left: null,
    top: null,
    width: null,
    height: null,
    margin: null,
    'z-index': null,
  });
  // Last absolute element gone → unpin the section (restores pure flow).
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
  }
  commit(ctx);
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
  for (const el of els) toAbsolute(ctx, el, design.height);
  const rects = els.map((el) => slideRect(ctx, el));
  const box =
    els.length >= 2
      ? unionRect(rects)
      : { left: 0, top: 0, width: design.width, height: design.height };
  els.forEach((el, i) => {
    const r = rects[i];
    const patch: StylePatch = {};
    if (edge === 'left') patch.left = `${Math.round(box.left)}px`;
    if (edge === 'right') patch.left = `${Math.round(box.left + box.width - r.width)}px`;
    if (edge === 'hcenter') patch.left = `${Math.round(box.left + (box.width - r.width) / 2)}px`;
    if (edge === 'top') patch.top = `${Math.round(box.top)}px`;
    if (edge === 'bottom') patch.top = `${Math.round(box.top + box.height - r.height)}px`;
    if (edge === 'vcenter') patch.top = `${Math.round(box.top + (box.height - r.height) / 2)}px`;
    applyStyle(el, patch);
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
  for (const el of els) toAbsolute(ctx, el, design.height);
  const items = els
    .map((el) => ({ el, rect: slideRect(ctx, el) }))
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
    applyStyle(it.el, {
      [axis === 'h' ? 'left' : 'top']: `${Math.round(cursor)}px`,
    });
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
  for (const el of els) toAbsolute(ctx, el, design.height);
  const rects = els.map((el) => slideRect(ctx, el));
  const box = unionRect(rects);
  const group = ctx.doc.createElement('div');
  group.className = GROUP_CLASS;
  applyStyle(group, {
    position: 'absolute',
    left: `${Math.round(box.left)}px`,
    top: `${Math.round(box.top)}px`,
    width: `${Math.round(box.width)}px`,
    height: `${Math.round(box.height)}px`,
  });
  // Insert where the first (topmost in DOM order) member sat.
  const anchor = els
    .slice()
    .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))[0];
  anchor.before(group);
  els.forEach((el, i) => {
    applyStyle(el, {
      left: `${Math.round(rects[i].left - box.left)}px`,
      top: `${Math.round(rects[i].top - box.top)}px`,
    });
    group.appendChild(el);
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
    const r = slideRect(ctx, child);
    applyStyle(child, {
      position: 'absolute',
      left: `${Math.round(r.left)}px`,
      top: `${Math.round(r.top)}px`,
    });
    group.before(child);
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
    if (el === moving || !(el instanceof HTMLElement)) continue;
    if (el.tagName === 'ASIDE') continue;
    const r = slideRect(ctx, el);
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
