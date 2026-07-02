/**
 * Shapes: `<svg class="re-shape" data-re-shape="{params}">…</svg>`, absolutely
 * positioned in slide space. The params JSON is the editable truth; the SVG
 * content is regenerated from it at the element's current size.
 */
import type { StageCtx } from './commands';
import { commit, insertHtmlSnippet } from './commands';
import { ensureFreeLayoutSection } from './geometry';
import { useDeckStore } from '../state/deckStore';

export const SHAPE_ATTR = 'data-re-shape';

export type ShapeKind = 'rect' | 'ellipse' | 'line' | 'arrow';
export const SHAPE_KINDS: ShapeKind[] = ['rect', 'ellipse', 'line', 'arrow'];

export interface ShapeSpec {
  kind: ShapeKind;
  fill: string; // 'none' for line/arrow
  stroke: string;
  strokeWidth: number;
  dash: 'solid' | 'dashed' | 'dotted';
  opacity: number; // 0..1
  radius?: number; // rect corner radius
}

export function isShapeEl(el: Element): boolean {
  return el.hasAttribute(SHAPE_ATTR);
}

export function readShapeSpec(el: Element): ShapeSpec | null {
  const raw = el.getAttribute(SHAPE_ATTR);
  if (!raw) return null;
  try {
    return { ...defaultShapeSpec('rect'), ...(JSON.parse(raw) as Partial<ShapeSpec>) };
  } catch {
    return null;
  }
}

export function defaultShapeSpec(kind: ShapeKind): ShapeSpec {
  return {
    kind,
    fill: kind === 'line' || kind === 'arrow' ? 'none' : '#2a78d6',
    stroke: kind === 'rect' || kind === 'ellipse' ? 'none' : '#2a78d6',
    strokeWidth: kind === 'line' || kind === 'arrow' ? 3 : 0,
    dash: 'solid',
    opacity: 1,
    radius: kind === 'rect' ? 4 : undefined,
  };
}

function dashArray(spec: ShapeSpec): string {
  if (spec.dash === 'dashed') return `${spec.strokeWidth * 3},${spec.strokeWidth * 2}`;
  if (spec.dash === 'dotted') return `${spec.strokeWidth},${spec.strokeWidth * 1.5}`;
  return '';
}

/** Regenerate the SVG content from spec at the element's current CSS size. */
export function renderShapeInto(el: HTMLElement): void {
  const spec = readShapeSpec(el);
  if (!spec) return;
  const w = Math.max(8, parseInt(el.style.width, 10) || 160);
  const h = Math.max(8, parseInt(el.style.height, 10) || 100);
  el.setAttribute('viewBox', `0 0 ${w} ${h}`);
  el.setAttribute('preserveAspectRatio', 'none');

  const sw = spec.strokeWidth;
  const stroke =
    spec.stroke !== 'none' && sw > 0
      ? ` stroke="${spec.stroke}" stroke-width="${sw}"${dashArray(spec) ? ` stroke-dasharray="${dashArray(spec)}"` : ''}`
      : '';
  const inset = sw / 2;
  let inner = '';
  switch (spec.kind) {
    case 'rect':
      inner = `<rect x="${inset}" y="${inset}" width="${w - sw}" height="${h - sw}" rx="${spec.radius ?? 0}" fill="${spec.fill}"${stroke}/>`;
      break;
    case 'ellipse':
      inner = `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2 - inset}" ry="${h / 2 - inset}" fill="${spec.fill}"${stroke}/>`;
      break;
    case 'line':
      inner = `<line x1="${inset}" y1="${h - inset}" x2="${w - inset}" y2="${inset}"${stroke} stroke-linecap="round"/>`;
      break;
    case 'arrow': {
      // Diagonal arrow bottom-left → top-right; head drawn as a filled path
      // (no <marker> — markers need document-unique ids, which collide when
      // a deck holds several arrows).
      const head = Math.max(10, sw * 4);
      const x1 = inset;
      const y1 = h - inset;
      const x2 = w - inset;
      const y2 = inset;
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const bx = x2 - head * Math.cos(angle);
      const by = y2 - head * Math.sin(angle);
      const px = head * 0.45 * Math.cos(angle + Math.PI / 2);
      const py = head * 0.45 * Math.sin(angle + Math.PI / 2);
      const r = (n: number) => Math.round(n * 100) / 100;
      inner =
        `<line x1="${r(x1)}" y1="${r(y1)}" x2="${r(bx)}" y2="${r(by)}"${stroke} stroke-linecap="round"/>` +
        `<path d="M${r(x2)},${r(y2)} L${r(bx + px)},${r(by + py)} L${r(bx - px)},${r(by - py)} Z" fill="${spec.stroke}"/>`;
      break;
    }
  }
  el.innerHTML = inner;
  el.style.opacity = spec.opacity === 1 ? '' : String(spec.opacity);
  if (el.getAttribute('style') === '') el.removeAttribute('style');
}

export function writeShapeSpec(ctx: StageCtx, el: HTMLElement, patch: Partial<ShapeSpec>): void {
  const spec = { ...(readShapeSpec(el) ?? defaultShapeSpec('rect')), ...patch };
  el.setAttribute(SHAPE_ATTR, JSON.stringify(spec));
  renderShapeInto(el);
  commit(ctx);
}

export function insertShape(ctx: StageCtx, kind: ShapeKind): HTMLElement | null {
  const design = useDeckStore.getState().meta?.config ?? { width: 960, height: 700 };
  ensureFreeLayoutSection(ctx, design.height);
  const w = kind === 'line' || kind === 'arrow' ? 240 : 240;
  const h = kind === 'line' || kind === 'arrow' ? 120 : 160;
  const left = Math.round((design.width - w) / 2);
  const top = Math.round((design.height - h) / 2);
  const el = insertHtmlSnippet(
    ctx,
    `<svg class="re-shape" xmlns="http://www.w3.org/2000/svg" style="position: absolute; left: ${left}px; top: ${top}px; width: ${w}px; height: ${h}px;"></svg>`,
    null,
    false, // commit once below — one undo step for the whole insert
  );
  if (el) {
    el.setAttribute(SHAPE_ATTR, JSON.stringify(defaultShapeSpec(kind)));
    renderShapeInto(el);
    commit(ctx);
  }
  return el;
}
