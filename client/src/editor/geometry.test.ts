import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import type { StageCtx } from './commands';

// jsdom has no layout. Elements the tests create get precise instance mocks
// (see box()); elements created INSIDE geometry code (the group wrapper)
// fall back to this style-driven prototype rect, accumulated through
// positioned ancestors up to the section.
const origGetRect = HTMLElement.prototype.getBoundingClientRect;
beforeAll(() => {
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    let left = parseInt(this.style?.left, 10) || 0;
    let top = parseInt(this.style?.top, 10) || 0;
    let p = this.parentElement;
    while (p && p.tagName !== 'SECTION' && p !== document.body) {
      left += parseInt(p.style?.left, 10) || 0;
      top += parseInt(p.style?.top, 10) || 0;
      p = p.parentElement;
    }
    return {
      left,
      top,
      width: parseInt(this.style?.width, 10) || 0,
      height: parseInt(this.style?.height, 10) || 0,
    } as DOMRect;
  };
});
afterAll(() => {
  HTMLElement.prototype.getBoundingClientRect = origGetRect;
});
import {
  alignElements,
  anchorPoints,
  distributeElements,
  elementAnchorPoint,
  flipState,
  groupElements,
  nearestAnchor,
  rotation,
  setRotation,
  toggleFlip,
  snapValue,
  ungroupElements,
} from './geometry';

function makeStage(): { ctx: StageCtx; section: HTMLElement } {
  const section = document.createElement('section');
  // jsdom has no layout — give getBoundingClientRect deterministic values
  // from inline styles so slideRect works.
  document.body.appendChild(section);
  section.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 960, height: 700 }) as DOMRect;
  const ctx: StageCtx = { doc: document, section, slideId: 't', markClean: () => undefined };
  return { ctx, section };
}

function box(section: HTMLElement, left: number, top: number, w: number, h: number): HTMLElement {
  const el = document.createElement('div');
  el.style.position = 'absolute';
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  el.getBoundingClientRect = function (this: HTMLElement) {
    return {
      left: parseInt(this.style.left, 10) || 0,
      top: parseInt(this.style.top, 10) || 0,
      width: w,
      height: h,
    } as DOMRect;
  };
  section.appendChild(el);
  return el;
}

describe('align / distribute / group', () => {
  it('aligns left edges to the selection bounding box', () => {
    const { ctx, section } = makeStage();
    const a = box(section, 100, 50, 80, 40);
    const b = box(section, 300, 200, 120, 60);
    alignElements(ctx, [a, b], 'left', { width: 960, height: 700 });
    expect(a.style.left).toBe('100px');
    expect(b.style.left).toBe('100px');
  });

  it('a single element aligns to the slide', () => {
    const { ctx, section } = makeStage();
    const a = box(section, 100, 50, 100, 40);
    alignElements(ctx, [a], 'hcenter', { width: 960, height: 700 });
    expect(a.style.left).toBe('430px'); // (960-100)/2
    alignElements(ctx, [a], 'bottom', { width: 960, height: 700 });
    expect(a.style.top).toBe('660px');
  });

  it('distributes horizontally with equal gaps', () => {
    const { ctx, section } = makeStage();
    const a = box(section, 0, 0, 100, 40);
    const b = box(section, 150, 0, 100, 40);
    const c = box(section, 500, 0, 100, 40);
    distributeElements(ctx, [a, c, b], 'h', { width: 960, height: 700 });
    // span 0..600, total width 300, gap = (600-300)/2 = 150
    expect(a.style.left).toBe('0px');
    expect(b.style.left).toBe('250px');
    expect(c.style.left).toBe('500px');
  });

  it('group wraps at the union box with rebased children; ungroup restores', () => {
    const { ctx, section } = makeStage();
    const a = box(section, 100, 50, 80, 40);
    const b = box(section, 300, 200, 120, 60);
    const group = groupElements(ctx, [a, b], { width: 960, height: 700 })!;
    expect(group.className).toBe('re-group');
    expect(group.style.left).toBe('100px');
    expect(group.style.top).toBe('50px');
    expect(group.style.width).toBe('320px'); // 300+120-100
    expect(a.style.left).toBe('0px');
    expect(b.style.left).toBe('200px');
    expect(group.contains(a) && group.contains(b)).toBe(true);

    // ungroup rebases back to slide coordinates
    group.getBoundingClientRect = () =>
      ({ left: 100, top: 50, width: 320, height: 210 }) as DOMRect;
    a.getBoundingClientRect = () => ({ left: 100, top: 50, width: 80, height: 40 }) as DOMRect;
    b.getBoundingClientRect = () => ({ left: 300, top: 200, width: 120, height: 60 }) as DOMRect;
    const children = ungroupElements(ctx, group);
    expect(children).toHaveLength(2);
    expect(section.contains(a)).toBe(true);
    expect(a.style.left).toBe('100px');
    expect(b.style.left).toBe('300px');
    expect(section.querySelector('.re-group')).toBeNull();
  });
});

describe('snapValue (resize edge snapping)', () => {
  const edges = [0, 480, 960];

  it('snaps within threshold and reports the guide', () => {
    expect(snapValue(477, edges, 6)).toEqual({ v: 480, guide: 480 });
    expect(snapValue(4, edges, 6)).toEqual({ v: 0, guide: 0 });
  });

  it('leaves values outside threshold untouched', () => {
    expect(snapValue(470, edges, 6)).toEqual({ v: 470, guide: null });
  });

  it('picks the nearest candidate (ties go to the first)', () => {
    expect(snapValue(482, [480, 484], 6).v).toBe(480);
    expect(snapValue(483, [480, 484], 6).v).toBe(484);
  });
});

describe('anchor points (connector snapping)', () => {
  const rect = { left: 100, top: 50, width: 200, height: 100 };

  it('a box has 8 named anchors: 4 corners + 4 edge midpoints, no center', () => {
    const pts = anchorPoints(rect);
    expect(pts).toHaveLength(8);
    expect(pts).toContainEqual({ x: 100, y: 50, id: 'nw' });
    expect(pts).toContainEqual({ x: 200, y: 50, id: 'n' });
    expect(pts).toContainEqual({ x: 300, y: 100, id: 'e' });
    expect(pts).toContainEqual({ x: 300, y: 150, id: 'se' });
    expect(pts.some((p) => p.x === 200 && p.y === 100)).toBe(false); // center excluded
  });

  it('nearestAnchor picks by 2-D distance within threshold', () => {
    const el = document.createElement('div');
    const sets = [{ el, rect, points: anchorPoints(rect) }];
    expect(nearestAnchor({ x: 305, y: 96 }, sets, 8)).toEqual({ x: 300, y: 100, id: 'e', el });
    // 2-D distance matters: 6px in x + 6px in y is ~8.49px away → no snap at 8.
    expect(nearestAnchor({ x: 306, y: 106 }, sets, 8)).toBeNull();
    expect(nearestAnchor({ x: 500, y: 500 }, sets, 8)).toBeNull();
  });
});

describe('rotation', () => {
  it('parses and writes only the editor-managed rotate() form', () => {
    const el = document.createElement('div');
    expect(rotation(el)).toBe(0);
    setRotation(el, 30);
    expect(el.style.transform).toBe('rotate(30deg)');
    expect(rotation(el)).toBe(30);
    setRotation(el, 380.4); // normalized + rounded
    expect(rotation(el)).toBe(20);
    setRotation(el, -190);
    expect(rotation(el)).toBe(170);
    setRotation(el, 0); // cleared, style attr dropped
    expect(el.getAttribute('style')).toBeNull();
    // Foreign transforms are opaque — never parsed, never rewritten.
    el.style.transform = 'scale(2) rotate(10deg)';
    expect(rotation(el)).toBeNull();
  });

  it('elementAnchorPoint rotates anchors around the element center', () => {
    const section = document.createElement('section');
    document.body.appendChild(section);
    const ctx = { doc: document, section, slideId: 't', markClean: () => undefined };
    const el = box(section, 500, 100, 100, 100);
    // Square rotated 90°: the 'e' anchor lands where 's' was.
    el.style.transform = 'rotate(90deg)';
    const p = elementAnchorPoint(ctx, el, 'e');
    expect(p.x).toBeCloseTo(550, 5);
    expect(p.y).toBeCloseTo(200, 5);
    // nw corner → ne position.
    const c = elementAnchorPoint(ctx, el, 'nw');
    expect(c.x).toBeCloseTo(600, 5);
    expect(c.y).toBeCloseTo(100, 5);
  });
});

describe('flip (managed transform)', () => {
  it('toggles axes and composes with rotation', () => {
    const el = document.createElement('div');
    expect(flipState(el)).toEqual({ x: false, y: false });
    toggleFlip(el, 'x');
    expect(el.style.transform).toBe('scale(-1, 1)');
    setRotation(el, 45); // rotation write preserves the flip
    expect(el.style.transform).toBe('rotate(45deg) scale(-1, 1)');
    expect(rotation(el)).toBe(45);
    expect(flipState(el)).toEqual({ x: true, y: false });
    toggleFlip(el, 'y');
    toggleFlip(el, 'x'); // back off x
    expect(el.style.transform).toBe('rotate(45deg) scale(1, -1)');
    setRotation(el, 0);
    expect(el.style.transform).toBe('scale(1, -1)');
    toggleFlip(el, 'y'); // all neutral → style cleared
    expect(el.getAttribute('style')).toBeNull();
    // Foreign transforms stay untouched.
    el.style.transform = 'matrix(1,0,0,1,0,0)';
    toggleFlip(el, 'x');
    expect(el.style.transform).toBe('matrix(1,0,0,1,0,0)');
    expect(flipState(el)).toBeNull();
  });
});
