/**
 * Free positioning: geometry helpers + style writing. All coordinates are
 * slide-space pixels (the iframe's own CSS px — unscaled by the canvas zoom),
 * written as inline styles: plain reveal.js that round-trips cleanly.
 */
import type { StageCtx } from './commands';
import { commit } from './commands';

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
 * Pins the section's height so the section box matches the slide box in the
 * real presentation too — without this, reveal's vertical centering would
 * shift absolute coordinates between editor and runtime.
 */
export function toAbsolute(ctx: StageCtx, el: HTMLElement, designHeight: number): void {
  if (isAbsolute(el)) return;
  ensureFreeLayoutSection(ctx, designHeight);
  const rect = slideRect(ctx, el);
  applyStyle(el, {
    position: 'absolute',
    left: `${Math.round(rect.left)}px`,
    top: `${Math.round(rect.top)}px`,
    width: `${Math.round(rect.width)}px`,
    margin: '0',
  });
}

export function ensureFreeLayoutSection(ctx: StageCtx, designHeight: number): void {
  if (!ctx.section.style.height) {
    applyStyle(ctx.section, { height: `${designHeight}px` });
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
  commit(ctx);
}

export function changeZOrder(ctx: StageCtx, el: HTMLElement, dir: 1 | -1): void {
  const current = parseInt(el.style.zIndex || '0', 10) || 0;
  const next = current + dir;
  applyStyle(el, { 'z-index': next === 0 ? null : String(next) });
  commit(ctx);
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
