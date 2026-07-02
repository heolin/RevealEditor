import { describe, it, expect } from 'vitest';
import type { StageCtx } from './commands';
import {
  alignElements,
  distributeElements,
  groupElements,
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
