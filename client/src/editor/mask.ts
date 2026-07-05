/**
 * Image masks — editable shape masks for <img>, expressed as a plain inline
 * `clip-path`. No wrapper, no data-re-* attribute: the CSS string IS the source
 * of truth (images stay "plain HTML", ARCHITECTURE §8), so a masked image
 * round-trips as-is and renders standalone in reveal.js.
 *
 * The mask is a parametric `MaskShape` (percentages of the image box) so it can
 * be dragged directly on the canvas (see overlay/MaskOverlay). Emit is
 * DETERMINISTIC so an unedited mask re-serialises identically; `parseMaskShape`
 * reads a clip-path back for editing, and reports `custom` for anything we
 * didn't emit (which is then left untouched — unknown markup is sacred).
 */

/** Picker options (geometric starting points). */
export type MaskKind =
  | 'none'
  | 'circle'
  | 'ellipse'
  | 'rounded'
  | 'rect'
  | 'triangle'
  | 'diamond'
  | 'hexagon';

/** The editable geometry. All numbers are percentages of the image box. */
export type MaskShape =
  | { kind: 'none' }
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { kind: 'inset'; top: number; right: number; bottom: number; left: number; round: number }
  | { kind: 'polygon'; points: [number, number][] }
  | { kind: 'custom'; raw: string };

export const MASK_OPTIONS: { value: MaskKind; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'circle', label: 'Circle' },
  { value: 'ellipse', label: 'Ellipse' },
  { value: 'rounded', label: 'Rounded' },
  { value: 'rect', label: 'Rectangle' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'hexagon', label: 'Hexagon' },
];

const POLY_PRESETS: Record<'triangle' | 'diamond' | 'hexagon', [number, number][]> = {
  triangle: [
    [50, 0],
    [0, 100],
    [100, 100],
  ],
  diamond: [
    [50, 0],
    [100, 50],
    [50, 100],
    [0, 50],
  ],
  hexagon: [
    [25, 0],
    [75, 0],
    [100, 50],
    [75, 100],
    [25, 100],
    [0, 50],
  ],
};

/** Fresh geometry for a picker option. */
export function presetShape(kind: MaskKind): MaskShape {
  switch (kind) {
    case 'none':
      return { kind: 'none' };
    case 'circle':
      return { kind: 'circle', cx: 50, cy: 50, r: 50 };
    case 'ellipse':
      return { kind: 'ellipse', cx: 50, cy: 50, rx: 50, ry: 35 };
    case 'rounded':
      return { kind: 'inset', top: 0, right: 0, bottom: 0, left: 0, round: 12 };
    case 'rect':
      return { kind: 'inset', top: 8, right: 8, bottom: 8, left: 8, round: 0 };
    case 'triangle':
    case 'diamond':
    case 'hexagon':
      return { kind: 'polygon', points: POLY_PRESETS[kind].map((p) => [...p] as [number, number]) };
  }
}

const r1 = (n: number) => Math.round(n * 10) / 10; // 1 decimal, stable

/** Canonical clip-path string for a shape. `null` = no clip-path (none). */
export function clipPathOf(shape: MaskShape): string | null {
  switch (shape.kind) {
    case 'none':
      return null;
    case 'custom':
      return shape.raw;
    case 'circle':
      return `circle(${r1(shape.r)}% at ${r1(shape.cx)}% ${r1(shape.cy)}%)`;
    case 'ellipse':
      return `ellipse(${r1(shape.rx)}% ${r1(shape.ry)}% at ${r1(shape.cx)}% ${r1(shape.cy)}%)`;
    case 'inset': {
      const base = `inset(${r1(shape.top)}% ${r1(shape.right)}% ${r1(shape.bottom)}% ${r1(shape.left)}%`;
      return shape.round > 0 ? `${base} round ${r1(shape.round)}%)` : `${base})`;
    }
    case 'polygon':
      return `polygon(${shape.points.map(([x, y]) => `${r1(x)}% ${r1(y)}%`).join(', ')})`;
  }
}

const NUM = String.raw`(-?[\d.]+)`;
function nums(s: string): number[] {
  return (s.match(/-?[\d.]+/g) ?? []).map(Number);
}

/** Read a clip-path string into an editable shape (tolerant of normalisation). */
export function parseMaskShape(raw: string | null | undefined): MaskShape {
  const s = (raw ?? '').trim().replace(/\s+/g, ' ');
  if (s === '' || s === 'none') return { kind: 'none' };

  let m = new RegExp(`^circle\\(\\s*${NUM}%\\s*(?:at\\s+${NUM}%\\s+${NUM}%\\s*)?\\)$`).exec(s);
  if (m) return { kind: 'circle', r: +m[1], cx: m[2] != null ? +m[2] : 50, cy: m[3] != null ? +m[3] : 50 };

  m = new RegExp(`^ellipse\\(\\s*${NUM}%\\s+${NUM}%\\s*(?:at\\s+${NUM}%\\s+${NUM}%\\s*)?\\)$`).exec(s);
  if (m)
    return {
      kind: 'ellipse',
      rx: +m[1],
      ry: +m[2],
      cx: m[3] != null ? +m[3] : 50,
      cy: m[4] != null ? +m[4] : 50,
    };

  const mi = /^inset\((.*)\)$/.exec(s);
  if (mi) {
    const [sidePart, roundPart] = mi[1].split(/\bround\b/);
    const v = nums(sidePart);
    const round = roundPart ? nums(roundPart)[0] ?? 0 : 0;
    // CSS shorthand: 1 = all; 2 = v|h; 3 = t|h|b; 4 = t r b l.
    const [t, r = t, b = t, l = r] = v;
    if (v.length >= 1) return { kind: 'inset', top: t, right: r, bottom: b, left: l, round };
  }

  const mp = /^polygon\((.*)\)$/.exec(s);
  if (mp) {
    const pts = mp[1]
      .split(',')
      .map((pair) => nums(pair) as number[])
      .filter((n) => n.length >= 2)
      .map((n) => [n[0], n[1]] as [number, number]);
    if (pts.length >= 3) return { kind: 'polygon', points: pts };
  }

  return { kind: 'custom', raw: s };
}

/** Map a shape back to the picker option it matches (for highlighting). */
export function maskKindOf(shape: MaskShape): MaskKind | null {
  switch (shape.kind) {
    case 'none':
      return 'none';
    case 'circle':
      return 'circle';
    case 'ellipse':
      return 'ellipse';
    case 'inset':
      return shape.round > 0 && shape.top === 0 && shape.right === 0 && shape.bottom === 0 && shape.left === 0
        ? 'rounded'
        : 'rect';
    case 'polygon': {
      const byCount: Record<number, MaskKind> = { 3: 'triangle', 4: 'diamond', 6: 'hexagon' };
      return byCount[shape.points.length] ?? null;
    }
    case 'custom':
      return null;
  }
}

/** Convenience: canonical clip-path for a picker option (fresh params). */
export function clipPathFor(kind: MaskKind): string | null {
  return clipPathOf(presetShape(kind));
}
