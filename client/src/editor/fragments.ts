/**
 * Fragments: reveal's step-by-step reveals, driven purely by classes and
 * data-fragment-index — which is why the editor can toggle, order, and
 * preview them without the runtime.
 */
import type { StageCtx } from './commands';
import { commit } from './commands';

export const FRAGMENT_VARIANTS = [
  'fade-in', // reveal default when no variant class
  'fade-out',
  'fade-up',
  'fade-down',
  'fade-left',
  'fade-right',
  'fade-in-then-out',
  'fade-in-then-semi-out',
  'semi-fade-out',
  'grow',
  'shrink',
  'strike',
  'highlight-red',
  'highlight-green',
  'highlight-blue',
  'highlight-current-red',
  'highlight-current-green',
  'highlight-current-blue',
];

const VARIANT_SET = new Set(FRAGMENT_VARIANTS.filter((v) => v !== 'fade-in'));

export function isFragment(el: Element): boolean {
  return el.classList.contains('fragment');
}

export function fragmentVariant(el: Element): string {
  for (const cls of Array.from(el.classList)) {
    if (VARIANT_SET.has(cls)) return cls;
  }
  return 'fade-in';
}

export function setFragment(ctx: StageCtx, el: HTMLElement, on: boolean): void {
  if (on) {
    el.classList.add('fragment', 'visible');
  } else {
    el.classList.remove('fragment', 'visible', 'current-fragment');
    for (const v of VARIANT_SET) el.classList.remove(v);
    el.removeAttribute('data-fragment-index');
    if (el.classList.length === 0) el.removeAttribute('class');
  }
  commit(ctx);
}

export function setFragmentVariant(ctx: StageCtx, el: HTMLElement, variant: string): void {
  for (const v of VARIANT_SET) el.classList.remove(v);
  if (variant !== 'fade-in') el.classList.add(variant);
  commit(ctx);
}

export function setFragmentIndex(ctx: StageCtx, el: HTMLElement, index: number | null): void {
  if (index === null) el.removeAttribute('data-fragment-index');
  else el.setAttribute('data-fragment-index', String(index));
  commit(ctx);
}

/** All fragments of the slide in effective order (reveal's rule: explicit index first, then DOM order). */
export function effectiveFragments(section: HTMLElement): HTMLElement[] {
  const els = Array.from(section.querySelectorAll<HTMLElement>('.fragment'));
  return els
    .map((el, domIdx) => ({
      el,
      domIdx,
      idx: el.hasAttribute('data-fragment-index')
        ? parseInt(el.getAttribute('data-fragment-index')!, 10)
        : null,
    }))
    .sort((a, b) => {
      if (a.idx !== null && b.idx !== null) return a.idx - b.idx || a.domIdx - b.domIdx;
      if (a.idx !== null) return -1;
      if (b.idx !== null) return 1;
      return a.domIdx - b.domIdx;
    })
    .map((x) => x.el);
}

/**
 * Move a fragment one step in the effective order. Once order is edited,
 * ALL fragments get explicit indices — avoids reveal's mixed-mode ambiguity.
 */
export function moveFragment(ctx: StageCtx, el: HTMLElement, dir: 1 | -1): void {
  const order = effectiveFragments(ctx.section);
  const from = order.indexOf(el);
  const to = from + dir;
  if (from < 0 || to < 0 || to >= order.length) return;
  [order[from], order[to]] = [order[to], order[from]];
  order.forEach((frag, i) => frag.setAttribute('data-fragment-index', String(i)));
  commit(ctx);
}

/**
 * Preview a fragment step without the runtime: step k shows the first k
 * fragments (reveal's own CSS reacts to visible/current-fragment).
 * Editor-only state — serializeSlide strips both classes.
 */
export function applyFragmentStep(section: HTMLElement, step: number): void {
  const order = effectiveFragments(section);
  order.forEach((el, i) => {
    el.classList.toggle('visible', i < step);
    el.classList.toggle('current-fragment', i === step - 1);
  });
}

/** Editor default state: everything visible so everything is editable. */
export function showAllFragments(section: HTMLElement): void {
  for (const el of Array.from(section.querySelectorAll('.fragment'))) {
    el.classList.add('visible');
    el.classList.remove('current-fragment');
  }
}
