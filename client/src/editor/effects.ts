/**
 * Element effects — visual effects applied as a plain inline CSS `filter`, so
 * they round-trip clean and render standalone in reveal.js. `filter` composes
 * multiple functions (drop-shadow, blur, grayscale, …); these helpers read and
 * rewrite ONE named function while preserving the others, so effects can be
 * mixed and future ones added without clobbering.
 *
 * We use `filter: drop-shadow(...)` so the shadow follows the element's real
 * shape/alpha: a circle-masked image casts a circular shadow, an SVG shape's
 * shadow hugs its outline, and text shadows the glyphs. The exception is
 * box-like elements such as tables — there `drop-shadow` would trace every
 * cell's text and borders, so we use a rectangular `box-shadow` on the whole
 * box instead.
 */
import type { StageCtx } from './commands';
import { commit, setElementStyleProp } from './commands';
import { applyStyle } from './geometry';

export interface Shadow {
  dx: number;
  dy: number;
  blur: number;
  color: string;
}

export interface ShadowPreset {
  key: string;
  label: string;
  shadow: Shadow | null;
}

export const SHADOW_PRESETS: ShadowPreset[] = [
  { key: 'none', label: 'None', shadow: null },
  { key: 'soft', label: 'Soft', shadow: { dx: 0, dy: 2, blur: 6, color: 'rgba(0,0,0,0.25)' } },
  { key: 'medium', label: 'Medium', shadow: { dx: 0, dy: 6, blur: 14, color: 'rgba(0,0,0,0.3)' } },
  { key: 'strong', label: 'Strong', shadow: { dx: 0, dy: 12, blur: 24, color: 'rgba(0,0,0,0.35)' } },
  { key: 'long', label: 'Long', shadow: { dx: 8, dy: 12, blur: 6, color: 'rgba(0,0,0,0.25)' } },
];

export const DEFAULT_SHADOW: Shadow = { dx: 0, dy: 6, blur: 14, color: 'rgba(0,0,0,0.3)' };

export function shadowToFilter(s: Shadow): string {
  return `drop-shadow(${s.dx}px ${s.dy}px ${s.blur}px ${s.color})`;
}

export function shadowToBoxShadow(s: Shadow): string {
  return `${s.dx}px ${s.dy}px ${s.blur}px ${s.color}`;
}

/** Box-like elements get a rectangular box-shadow (whole box) rather than a
 *  content-tracing drop-shadow — otherwise a table shadows every cell's text. */
export function usesBoxShadow(el: HTMLElement): boolean {
  return el.tagName === 'TABLE';
}

// A single filter function token, tolerant of one level of nested parens
// (e.g. an rgba()/hsla() color), regardless of where the color sits.
const fnRe = (name: string) => new RegExp(`${name}\\((?:[^()]|\\([^()]*\\))*\\)`, 'g');

function parseShadowArgs(a: string): Shadow {
  // Color may come first (browser-normalised) or last (as we emit). Pull out
  // the three px lengths; whatever remains is the color.
  const lens = (a.match(/-?[\d.]+px/g) ?? []).map((v) => parseFloat(v));
  const color = a.replace(/-?[\d.]+px/g, '').replace(/\s+/g, ' ').trim() || 'rgba(0,0,0,0.35)';
  const [dx = 0, dy = 0, blur = 0] = lens;
  return { dx, dy, blur, color };
}

/** Read the element's current shadow (box-shadow for tables, else drop-shadow). */
export function readShadow(el: HTMLElement): Shadow | null {
  if (usesBoxShadow(el)) {
    const bs = el.style.boxShadow;
    return bs && bs !== 'none' ? parseShadowArgs(bs) : null;
  }
  const m = (el.style.filter || '').match(fnRe('drop-shadow'));
  if (!m) return null;
  return parseShadowArgs(m[0].slice('drop-shadow('.length, -1));
}

/** Set/replace/remove the shadow. Tables get a rectangular `box-shadow` on the
 *  whole box; everything else a `drop-shadow` filter (other filters preserved). */
export function setShadow(ctx: StageCtx, el: HTMLElement, shadow: Shadow | null): void {
  if (usesBoxShadow(el)) {
    // Drop any stray drop-shadow so the two don't stack, and set box-shadow.
    const filter = (el.style.filter || '').replace(fnRe('drop-shadow'), '').replace(/\s+/g, ' ').trim();
    applyStyle(el, {
      'box-shadow': shadow ? shadowToBoxShadow(shadow) : null,
      filter: filter || null,
    });
    commit(ctx);
    return;
  }
  const others = (el.style.filter || '').replace(fnRe('drop-shadow'), '').replace(/\s+/g, ' ').trim();
  const next = [others, shadow ? shadowToFilter(shadow) : ''].filter(Boolean).join(' ');
  setElementStyleProp(ctx, el, 'filter', next || null);
}

/* ---------- generic filter functions (blur, grayscale, brightness, …) ------- */

/** Build the element's filter string with `name(...)` replaced/added (null =
 *  removed), preserving every other filter function. No write — for live drag. */
export function composeFilter(el: HTMLElement, name: string, fn: string | null): string {
  const others = (el.style.filter || '').replace(fnRe(name), '').replace(/\s+/g, ' ').trim();
  return [others, fn || ''].filter(Boolean).join(' ');
}

/** The numeric argument of a filter function (blur px, brightness %, …), or null. */
export function readFilterNum(el: HTMLElement, name: string): number | null {
  const m = (el.style.filter || '').match(fnRe(name));
  if (!m) return null;
  const n = m[0].match(/-?[\d.]+/);
  return n ? parseFloat(n[0]) : null;
}

/** Whether a (parameterless-ish) filter function is present, e.g. grayscale. */
export function hasFilter(el: HTMLElement, name: string): boolean {
  return (el.style.filter || '').includes(`${name}(`);
}

/** Which preset (if any) the current shadow matches — for highlighting. */
export function shadowPresetKey(shadow: Shadow | null): string {
  if (!shadow) return 'none';
  const hit = SHADOW_PRESETS.find(
    (p) =>
      p.shadow &&
      p.shadow.dx === shadow.dx &&
      p.shadow.dy === shadow.dy &&
      p.shadow.blur === shadow.blur &&
      p.shadow.color === shadow.color,
  );
  return hit ? hit.key : 'custom';
}
