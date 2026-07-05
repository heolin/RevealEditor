import { describe, it, expect } from 'vitest';
import {
  clipPathOf,
  parseMaskShape,
  presetShape,
  maskKindOf,
  clipPathFor,
  MASK_OPTIONS,
  type MaskKind,
  type MaskShape,
} from './mask';

const PRESETS: MaskKind[] = ['circle', 'ellipse', 'rounded', 'rect', 'triangle', 'diamond', 'hexagon'];

describe('mask shapes', () => {
  it('none has no clip-path', () => {
    expect(clipPathOf({ kind: 'none' })).toBeNull();
    expect(parseMaskShape(null)).toEqual({ kind: 'none' });
    expect(parseMaskShape('')).toEqual({ kind: 'none' });
    expect(parseMaskShape('none')).toEqual({ kind: 'none' });
  });

  it('every preset emits, parses back, and maps to its picker kind', () => {
    for (const kind of PRESETS) {
      const shape = presetShape(kind);
      const str = clipPathOf(shape)!;
      expect(str, `${kind} emits`).toBeTruthy();
      const parsed = parseMaskShape(str);
      expect(parsed, `${kind} round-trips`).toEqual(shape);
      expect(maskKindOf(parsed), `${kind} maps back`).toBe(kind);
    }
  });

  it('circle carries edited center + radius', () => {
    const shape: MaskShape = { kind: 'circle', cx: 30, cy: 70, r: 25 };
    expect(clipPathOf(shape)).toBe('circle(25% at 30% 70%)');
    expect(parseMaskShape('circle(25% at 30% 70%)')).toEqual(shape);
    // bare circle(R%) defaults center to 50/50
    expect(parseMaskShape('circle(40%)')).toEqual({ kind: 'circle', cx: 50, cy: 50, r: 40 });
  });

  it('ellipse carries independent radii', () => {
    const shape: MaskShape = { kind: 'ellipse', cx: 50, cy: 50, rx: 40, ry: 25 };
    expect(clipPathOf(shape)).toBe('ellipse(40% 25% at 50% 50%)');
    expect(parseMaskShape('ellipse(40% 25% at 50% 50%)')).toEqual(shape);
  });

  it('inset carries four sides + round; parses CSS shorthands', () => {
    expect(clipPathOf({ kind: 'inset', top: 5, right: 10, bottom: 15, left: 20, round: 8 })).toBe(
      'inset(5% 10% 15% 20% round 8%)',
    );
    expect(parseMaskShape('inset(5% 10% 15% 20% round 8%)')).toEqual({
      kind: 'inset', top: 5, right: 10, bottom: 15, left: 20, round: 8,
    });
    // 1-value shorthand → all sides equal, no round
    expect(parseMaskShape('inset(10%)')).toEqual({
      kind: 'inset', top: 10, right: 10, bottom: 10, left: 10, round: 0,
    });
    // 2-value shorthand → vertical | horizontal
    expect(parseMaskShape('inset(10% 20%)')).toEqual({
      kind: 'inset', top: 10, right: 20, bottom: 10, left: 20, round: 0,
    });
    // rounded preset omits the round keyword only when 0
    expect(clipPathOf({ kind: 'inset', top: 0, right: 0, bottom: 0, left: 0, round: 0 })).toBe(
      'inset(0% 0% 0% 0%)',
    );
  });

  it('polygon carries and round-trips its vertices', () => {
    const shape: MaskShape = { kind: 'polygon', points: [[10, 0], [90, 20], [50, 100]] };
    expect(clipPathOf(shape)).toBe('polygon(10% 0%, 90% 20%, 50% 100%)');
    expect(parseMaskShape('polygon(10% 0%, 90% 20%, 50% 100%)')).toEqual(shape);
  });

  it('reports unrecognised clip-path as custom and preserves it', () => {
    expect(parseMaskShape('url(#m)')).toEqual({ kind: 'custom', raw: 'url(#m)' });
    expect(clipPathOf({ kind: 'custom', raw: 'url(#m)' })).toBe('url(#m)');
    expect(maskKindOf({ kind: 'custom', raw: 'x' })).toBeNull();
  });

  it('clipPathFor gives fresh preset strings; MASK_OPTIONS starts with none', () => {
    expect(clipPathFor('circle')).toBe('circle(50% at 50% 50%)');
    expect(clipPathFor('none')).toBeNull();
    expect(MASK_OPTIONS[0].value).toBe('none');
  });
});
