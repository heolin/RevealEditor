import { describe, it, expect } from 'vitest';
import {
  applyFragmentStep,
  effectiveFragments,
  fragmentVariant,
  showAllFragments,
} from './fragments';
import { snapRect } from './geometry';
import { serializeSlide } from './serializeSlide';

function section(html: string): HTMLElement {
  const s = document.createElement('section');
  s.id = 're-stage';
  s.className = 'present';
  s.innerHTML = html;
  return s;
}

describe('fragments', () => {
  it('orders by explicit index first, then document order', () => {
    const s = section(
      '<p class="fragment">a</p>' +
        '<p class="fragment" data-fragment-index="0">b</p>' +
        '<p class="fragment">c</p>',
    );
    expect(effectiveFragments(s).map((el) => el.textContent)).toEqual(['b', 'a', 'c']);
  });

  it('detects the variant among unrelated classes', () => {
    const s = section('<p class="big fragment fade-up custom">x</p>');
    expect(fragmentVariant(s.querySelector('p')!)).toBe('fade-up');
  });

  it('step preview classes are editor-only — stripped on serialize', () => {
    const s = section('<p class="fragment">a</p><p class="fragment">b</p>');
    applyFragmentStep(s, 1);
    const [a, b] = Array.from(s.querySelectorAll('p'));
    expect(a.classList.contains('visible')).toBe(true);
    expect(a.classList.contains('current-fragment')).toBe(true);
    expect(b.classList.contains('visible')).toBe(false);
    const out = serializeSlide(s);
    expect(out).not.toContain('visible');
    expect(out).not.toContain('current-fragment');
    showAllFragments(s);
    expect(b.classList.contains('visible')).toBe(true);
  });
});

describe('snapRect', () => {
  const edges = { xs: [0, 480, 960], ys: [0, 350, 700] };

  it('snaps a near edge within threshold', () => {
    const r = snapRect({ left: 3, top: 100, width: 100, height: 50 }, edges, 6);
    expect(r.dx).toBe(-3);
    expect(r.x).toBe(0);
    expect(r.y).toBeNull();
  });

  it('snaps element center to slide center', () => {
    const r = snapRect({ left: 434, top: 329, width: 100, height: 50 }, edges, 6);
    expect(r.dx).toBe(-4); // center 484 → 480
    expect(r.dy).toBe(-4); // center 354 → 350
  });

  it('does not snap outside threshold', () => {
    const r = snapRect({ left: 200, top: 200, width: 10, height: 10 }, edges, 6);
    expect(r.x).toBeNull();
    expect(r.y).toBeNull();
    expect(r.dx).toBe(0);
  });
});
