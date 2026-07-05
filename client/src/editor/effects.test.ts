import { describe, it, expect } from 'vitest';
import {
  shadowToFilter,
  readShadow,
  setShadow,
  shadowPresetKey,
  SHADOW_PRESETS,
  composeFilter,
  readFilterNum,
  hasFilter,
  usesBoxShadow,
  shadowToBoxShadow,
} from './effects';
import type { StageCtx } from './commands';

function imgWith(filter: string): HTMLElement {
  const el = document.createElement('img');
  if (filter) el.style.filter = filter;
  return el;
}

describe('effects — shadow', () => {
  it('emits a drop-shadow filter', () => {
    expect(shadowToFilter({ dx: 0, dy: 6, blur: 14, color: 'rgba(0,0,0,0.3)' })).toBe(
      'drop-shadow(0px 6px 14px rgba(0,0,0,0.3))',
    );
  });

  it('reads a shadow whether the color is first or last', () => {
    expect(readShadow(imgWith('drop-shadow(0px 6px 14px rgba(0,0,0,0.3))'))).toEqual({
      dx: 0, dy: 6, blur: 14, color: 'rgba(0,0,0,0.3)',
    });
    // browser-normalised form: color first
    expect(readShadow(imgWith('drop-shadow(rgba(0, 0, 0, 0.35) 0px 12px 24px)'))).toEqual({
      dx: 0, dy: 12, blur: 24, color: 'rgba(0, 0, 0, 0.35)',
    });
    expect(readShadow(imgWith(''))).toBeNull();
  });

  it('preset round-trips to its own key', () => {
    for (const p of SHADOW_PRESETS) {
      expect(shadowPresetKey(p.shadow)).toBe(p.key);
    }
    expect(shadowPresetKey({ dx: 3, dy: 3, blur: 3, color: 'red' })).toBe('custom');
  });

  it('setShadow preserves other filter functions', () => {
    const el = imgWith('blur(2px)');
    const commits: unknown[] = [];
    const ctx = { doc: document, section: el, slideId: 's', markClean() {} } as unknown as StageCtx;
    // setElementStyleProp calls commit(ctx); stub the store commit path by
    // catching the thrown-free set — here we just assert the style it writes.
    try {
      setShadow(ctx, el, { dx: 0, dy: 6, blur: 14, color: 'rgba(0,0,0,0.3)' });
    } catch {
      /* commit touches stores not present in this unit env; style is already set */
    }
    expect(el.style.filter).toContain('blur(2px)');
    expect(el.style.filter).toContain('drop-shadow(0px 6px 14px rgba(0,0,0,0.3))');
    // removing the shadow keeps the blur
    try {
      setShadow(ctx, el, null);
    } catch {
      /* ignore commit */
    }
    expect(el.style.filter).toBe('blur(2px)');
  });
});

describe('effects — composable filters', () => {
  it('composeFilter adds/replaces one function, preserving others', () => {
    const el = imgWith('drop-shadow(0px 6px 14px rgba(0,0,0,0.3))');
    // add blur alongside the shadow
    el.style.filter = composeFilter(el, 'blur', 'blur(4px)');
    expect(el.style.filter).toContain('drop-shadow(0px 6px 14px rgba(0,0,0,0.3))');
    expect(el.style.filter).toContain('blur(4px)');
    // replace blur
    el.style.filter = composeFilter(el, 'blur', 'blur(9px)');
    expect(el.style.filter).toContain('blur(9px)');
    expect(el.style.filter).not.toContain('blur(4px)');
    // remove blur, shadow stays
    el.style.filter = composeFilter(el, 'blur', null);
    expect(el.style.filter).toBe('drop-shadow(0px 6px 14px rgba(0,0,0,0.3))');
  });

  it('readFilterNum + hasFilter read composed functions', () => {
    const el = imgWith('grayscale(100%) brightness(120%) blur(3px)');
    expect(hasFilter(el, 'grayscale')).toBe(true);
    expect(hasFilter(el, 'sepia')).toBe(false);
    expect(readFilterNum(el, 'brightness')).toBe(120);
    expect(readFilterNum(el, 'blur')).toBe(3);
    expect(readFilterNum(el, 'saturate')).toBeNull();
  });
})

describe('effects — table box-shadow', () => {
  function tableEl(): HTMLElement {
    return document.createElement('table');
  }
  it('tables use box-shadow, not drop-shadow', () => {
    const el = tableEl();
    expect(usesBoxShadow(el)).toBe(true);
    const ctx = { doc: document, section: el, slideId: 's', markClean() {} } as unknown as import('./commands').StageCtx;
    try { setShadow(ctx, el, { dx: 0, dy: 6, blur: 14, color: 'rgba(0,0,0,0.3)' }); } catch { /* commit */ }
    expect(el.style.boxShadow).toBe(shadowToBoxShadow({ dx: 0, dy: 6, blur: 14, color: 'rgba(0,0,0,0.3)' }));
    expect(el.style.filter).toBe('');
    expect(readShadow(el)).toEqual({ dx: 0, dy: 6, blur: 14, color: 'rgba(0,0,0,0.3)' });
    try { setShadow(ctx, el, null); } catch { /* commit */ }
    expect(el.style.boxShadow).toBe('');
  });
  it('non-tables keep using drop-shadow', () => {
    const img = document.createElement('img');
    expect(usesBoxShadow(img)).toBe(false);
  });
});
