import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import type { StageCtx } from './commands';
import {
  REF_ATTR,
  SHAPE_ATTR,
  SHAPE_KINDS,
  approachDir,
  elbowPoints,
  shapeInnerSvg,
  connectorEndpoints,
  defaultShapeSpec,
  endpointBox,
  ensureRefId,
  ensureShapeLabel,
  previewLineSvg,
  readShapeSpec,
  reconcileConnectors,
  renderShapeInto,
  specEndpoints,
  type ShapeSpec,
} from './shapes';

/**
 * The pre-two-point renderer for line/arrow, kept verbatim as a reference:
 * specs saved before the endpoint model (no x1..y2, no heads) MUST render
 * byte-identically — unedited decks stay diff-clean.
 */
function legacyLineArrow(spec: ShapeSpec, w: number, h: number): string {
  const sw = spec.strokeWidth;
  const dashArray =
    spec.dash === 'dashed'
      ? `${sw * 3},${sw * 2}`
      : spec.dash === 'dotted'
        ? `${sw},${sw * 1.5}`
        : '';
  const stroke =
    spec.stroke !== 'none' && sw > 0
      ? ` stroke="${spec.stroke}" stroke-width="${sw}"${dashArray ? ` stroke-dasharray="${dashArray}"` : ''}`
      : '';
  const inset = sw / 2;
  if (spec.kind === 'line') {
    return `<line x1="${inset}" y1="${h - inset}" x2="${w - inset}" y2="${inset}"${stroke} stroke-linecap="round"/>`;
  }
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
  return (
    `<line x1="${r(x1)}" y1="${r(y1)}" x2="${r(bx)}" y2="${r(by)}"${stroke} stroke-linecap="round"/>` +
    `<path d="M${r(x2)},${r(y2)} L${r(bx + px)},${r(by + py)} L${r(bx - px)},${r(by - py)} Z" fill="${spec.stroke}"/>`
  );
}

function renderWithSpec(spec: Partial<ShapeSpec>, w: number, h: number): string {
  const el = document.createElement('svg');
  el.setAttribute(SHAPE_ATTR, JSON.stringify(spec));
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  renderShapeInto(el as unknown as HTMLElement);
  return el.innerHTML;
}

/** jsdom rewrites self-closing tags on innerHTML round-trips — push expected
 *  strings through the same parse so comparisons are value-level. */
function domNormalized(html: string): string {
  const el = document.createElement('svg');
  el.innerHTML = html;
  return el.innerHTML;
}

describe('two-point line renderer', () => {
  it('renders pre-endpoint-model specs byte-identically to the old renderer', () => {
    const cases: Array<[Partial<ShapeSpec>, number, number]> = [
      [{ kind: 'line', stroke: '#2a78d6', strokeWidth: 3 }, 240, 120],
      [{ kind: 'line', stroke: '#e11', strokeWidth: 6, dash: 'dashed' }, 313, 97],
      [{ kind: 'arrow', stroke: '#2a78d6', strokeWidth: 3 }, 240, 120],
      [{ kind: 'arrow', stroke: '#0a0', strokeWidth: 5, dash: 'dotted' }, 555, 61],
      [{ kind: 'arrow', stroke: '#123456', strokeWidth: 1 }, 64, 480],
    ];
    for (const [partial, w, h] of cases) {
      const full = { ...defaultShapeSpec('rect'), ...partial } as ShapeSpec;
      expect(renderWithSpec(partial, w, h)).toBe(domNormalized(legacyLineArrow(full, w, h)));
    }
  });

  it('maps explicit normalized endpoints into the box', () => {
    // Horizontal line through the vertical center, stroke 2 → inset 1.
    const html = renderWithSpec(
      { kind: 'line', stroke: '#000', strokeWidth: 2, x1: 0, y1: 0.5, x2: 1, y2: 0.5 },
      100,
      20,
    );
    expect(html).toBe(
      domNormalized(
        '<line x1="1" y1="10" x2="99" y2="10" stroke="#000" stroke-width="2" stroke-linecap="round"/>',
      ),
    );
  });

  it('draws heads at start/end/both, line shortened at each head', () => {
    const spec = { kind: 'arrow', stroke: '#000', strokeWidth: 2, x1: 0, y1: 0.5, x2: 1, y2: 0.5 };
    const end = renderWithSpec({ ...spec, heads: 'end' } as Partial<ShapeSpec>, 100, 20);
    const start = renderWithSpec({ ...spec, heads: 'start' } as Partial<ShapeSpec>, 100, 20);
    const both = renderWithSpec({ ...spec, heads: 'both' } as Partial<ShapeSpec>, 100, 20);
    // head = max(10, 8) = 10; endpoints x: 1 and 99 (inset 1).
    expect(end).toContain('<line x1="1" y1="10" x2="89" y2="10"');
    expect(end.match(/<path/g)).toHaveLength(1);
    expect(end).toContain('M99,10'); // head tip at the end point
    expect(start).toContain('<line x1="11" y1="10" x2="99" y2="10"');
    expect(start).toContain('M1,10');
    expect(both).toContain('<line x1="11" y1="10" x2="89" y2="10"');
    expect(both.match(/<path/g)).toHaveLength(2);
  });

  it('specEndpoints defaults reproduce the legacy diagonal', () => {
    expect(specEndpoints({ kind: 'line' } as ShapeSpec)).toEqual({ x1: 0, y1: 1, x2: 1, y2: 0 });
  });
});

describe('endpointBox', () => {
  it('is the bbox of the endpoints', () => {
    expect(endpointBox({ x: 10, y: 50 }, { x: 110, y: 20 })).toEqual({
      left: 10,
      top: 20,
      width: 100,
      height: 30,
    });
  });

  it('degenerate axes get a centered minimum span', () => {
    // Horizontal line: zero height → 8px box centered on the line.
    expect(endpointBox({ x: 10, y: 40 }, { x: 110, y: 40 })).toEqual({
      left: 10,
      top: 36,
      width: 100,
      height: 8,
    });
    // Zero-length line.
    const b = endpointBox({ x: 5, y: 5 }, { x: 5, y: 5 });
    expect(b).toEqual({ left: 1, top: 1, width: 8, height: 8 });
  });
});

describe('previewLineSvg (live line drag preview)', () => {
  it('boxes the endpoints and renders an actual <line>, not a rectangle', () => {
    const { box, svg } = previewLineSvg('line', { x: 20, y: 100 }, { x: 120, y: 40 });
    expect(box).toEqual({ left: 20, top: 40, width: 100, height: 60 });
    // A line preview — never an <svg><rect> bounding box.
    expect(svg).toContain('<line');
    expect(svg).not.toContain('<rect');
    // Fills its (scaled) overlay container.
    expect(svg).toContain('width="100%"');
    expect(svg).toContain('preserveAspectRatio="none"');
  });

  it('an arrow preview carries an arrowhead', () => {
    const line = previewLineSvg('line', { x: 0, y: 0 }, { x: 100, y: 100 }).svg;
    const arrow = previewLineSvg('arrow', { x: 0, y: 0 }, { x: 100, y: 100 }).svg;
    // The arrow renders extra head geometry the plain line doesn't.
    expect(arrow.length).toBeGreaterThan(line.length);
    expect(arrow).toContain('<path');
  });
});

/* ---------- sticky connectors ---------- */

// jsdom has no layout — style-driven getBoundingClientRect (same pattern as
// geometry.test.ts) so stageRect/anchorPoint see the inline positions.
const origGetRect = HTMLElement.prototype.getBoundingClientRect;
beforeAll(() => {
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    return {
      left: parseInt(this.style?.left, 10) || 0,
      top: parseInt(this.style?.top, 10) || 0,
      width: parseInt(this.style?.width, 10) || 0,
      height: parseInt(this.style?.height, 10) || 0,
    } as DOMRect;
  };
});
afterAll(() => {
  HTMLElement.prototype.getBoundingClientRect = origGetRect;
});

function makeStage(): { ctx: StageCtx; section: HTMLElement } {
  const section = document.createElement('section');
  document.body.appendChild(section);
  const ctx: StageCtx = { doc: document, section, slideId: 't', markClean: () => undefined };
  return { ctx, section };
}

function targetBox(section: HTMLElement, ref: string, left: number, top: number): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute(REF_ATTR, ref);
  el.style.position = 'absolute';
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  el.style.width = '100px';
  el.style.height = '50px';
  section.appendChild(el);
  return el;
}

function connector(section: HTMLElement, spec: Partial<ShapeSpec>): HTMLElement {
  const el = document.createElement('svg');
  el.setAttribute(SHAPE_ATTR, JSON.stringify(spec));
  el.style.position = 'absolute';
  el.style.left = '100px';
  el.style.top = '100px';
  el.style.width = '100px';
  el.style.height = '8px';
  section.appendChild(el);
  return el;
}

describe('reconcileConnectors', () => {
  const baseSpec: Partial<ShapeSpec> = {
    kind: 'arrow',
    stroke: '#000',
    strokeWidth: 3,
    x1: 0,
    y1: 0.5,
    x2: 1,
    y2: 0.5,
  };

  it('attached endpoint follows the target box', () => {
    const { ctx, section } = makeStage();
    const target = targetBox(section, 'tgt1', 500, 100);
    const line = connector(section, { ...baseSpec, to: { ref: 'tgt1', anchor: 'w' } });

    reconcileConnectors(ctx);
    let { p2 } = connectorEndpoints(ctx, line);
    expect(Math.hypot(p2.x - 500, p2.y - 125)).toBeLessThan(1); // 'w' anchor

    target.style.left = '620px';
    target.style.top = '300px';
    reconcileConnectors(ctx);
    ({ p2 } = connectorEndpoints(ctx, line));
    expect(Math.hypot(p2.x - 620, p2.y - 325)).toBeLessThan(1);
    // Attachment survives in the spec.
    expect(readShapeSpec(line)?.to).toEqual({ ref: 'tgt1', anchor: 'w' });
  });

  it('snapGap keeps the endpoint short of the anchor along the line', () => {
    const { ctx, section } = makeStage();
    targetBox(section, 'tgt2', 500, 100);
    const line = connector(section, {
      ...baseSpec,
      snapGap: 10,
      to: { ref: 'tgt2', anchor: 'w' },
    });
    reconcileConnectors(ctx);
    const { p2 } = connectorEndpoints(ctx, line);
    const d = Math.hypot(p2.x - 500, p2.y - 125);
    expect(d).toBeGreaterThan(9);
    expect(d).toBeLessThan(11);
  });

  it('a deleted target detaches the end but keeps the geometry', () => {
    const { ctx, section } = makeStage();
    const target = targetBox(section, 'tgt3', 500, 100);
    const line = connector(section, { ...baseSpec, to: { ref: 'tgt3', anchor: 'w' } });
    reconcileConnectors(ctx);
    const before = connectorEndpoints(ctx, line);

    target.remove();
    reconcileConnectors(ctx);
    const spec = readShapeSpec(line)!;
    expect(spec.to).toBeUndefined();
    const after = connectorEndpoints(ctx, line);
    expect(Math.hypot(after.p2.x - before.p2.x, after.p2.y - before.p2.y)).toBeLessThan(1);
  });
});

describe('ensureRefId', () => {
  it('keeps a unique existing id, re-mints duplicated ones', () => {
    const { section } = makeStage();
    const a = targetBox(section, 'dup', 0, 0);
    const b = targetBox(section, 'dup', 200, 0);
    expect(ensureRefId(section, a)).not.toBe('dup'); // ambiguous → fresh
    const aId = a.getAttribute(REF_ATTR)!;
    expect(ensureRefId(section, a)).toBe(aId); // now unique → stable
    expect(b.getAttribute(REF_ATTR)).toBe('dup');
  });
});

describe('flowchart kinds', () => {
  const base = { fill: '#2a78d6', stroke: 'none', strokeWidth: 0 };

  it('renders each kind with its geometry', () => {
    expect(renderWithSpec({ ...base, kind: 'diamond' }, 200, 100)).toContain(
      '<polygon points="100,0 200,50 100,100 0,50"',
    );
    expect(renderWithSpec({ ...base, kind: 'triangle' }, 200, 100)).toContain(
      '<polygon points="100,0 200,100 0,100"',
    );
    const hexagon = renderWithSpec({ ...base, kind: 'hexagon' }, 200, 100);
    expect(hexagon.match(/<polygon points="([^"]+)"/)![1].split(' ')).toHaveLength(6);
    const parallelogram = renderWithSpec({ ...base, kind: 'parallelogram' }, 200, 100);
    expect(parallelogram.match(/<polygon points="([^"]+)"/)![1].split(' ')).toHaveLength(4);
    // Stadium: a rect with rx = half the height (capsule).
    expect(renderWithSpec({ ...base, kind: 'stadium' }, 200, 100)).toContain('rx="50"');
    // Cylinder: body path + top rim ellipse.
    const cylinder = renderWithSpec({ ...base, kind: 'cylinder' }, 200, 100);
    expect(cylinder).toContain('<path d="M 0 18 A 100 18');
    expect(cylinder).toContain('<ellipse');
  });
});

describe('shape labels', () => {
  function shapeEl(kind: string): HTMLElement {
    const el = document.createElement('svg');
    el.setAttribute(SHAPE_ATTR, JSON.stringify({ kind, fill: '#123', stroke: 'none', strokeWidth: 0 }));
    el.style.width = '200px';
    el.style.height = '100px';
    renderShapeInto(el);
    return el;
  }

  it('ensureShapeLabel creates a centered label div on fill shapes', () => {
    const rect = shapeEl('rect');
    const label = ensureShapeLabel(rect)!;
    expect(label.className).toContain('re-shape-label');
    expect(rect.querySelector('foreignObject')).toBeTruthy();
    // Sized to the box minus padding (8% + stroke).
    expect(rect.querySelector('foreignObject')!.getAttribute('width')).toBe('168');
  });

  it('re-rendering the shape preserves the label and its text', () => {
    const rect = shapeEl('rect');
    const label = ensureShapeLabel(rect)!;
    label.textContent = 'Node A';
    // Style change → full re-bake (what writeShapeSpec does).
    rect.setAttribute(
      SHAPE_ATTR,
      JSON.stringify({ kind: 'rect', fill: '#e03131', stroke: 'none', strokeWidth: 0 }),
    );
    renderShapeInto(rect);
    expect(rect.querySelector('.re-shape-label')?.textContent).toBe('Node A');
    expect(rect.querySelectorAll('foreignObject')).toHaveLength(1);
  });
});

describe('shape gallery kinds', () => {
  it('every kind renders non-empty markup at any size', () => {
    for (const kind of SHAPE_KINDS) {
      const spec = { ...defaultShapeSpec(kind), stroke: '#000', strokeWidth: 2 };
      for (const [w, h] of [[240, 160], [30, 22], [120, 120]]) {
        const svg = shapeInnerSvg(spec, w, h);
        expect(svg.length, `${kind} @ ${w}x${h}`).toBeGreaterThan(20);
        expect(svg, `${kind} balanced markup`).toMatch(/\/>$|<\/\w+>$/);
      }
    }
  });

  it('junction marks and storage rims are visible without a stroke', () => {
    const filled = (kind: string) =>
      shapeInnerSvg({ ...defaultShapeSpec(kind as never), strokeWidth: 0 }, 120, 120);
    expect(filled('summing').match(/<line /g)).toHaveLength(2); // the X
    expect(filled('orjunction').match(/<line /g)).toHaveLength(2); // the +
    expect(filled('summing')).toContain('#00000059'); // contrast fallback
    expect(filled('predefined').match(/<line /g)).toHaveLength(2); // side bars
    expect(filled('sort')).toContain('<line'); // divider
    expect(filled('multidocument').match(/<path /g)).toHaveLength(3); // stack
  });
});

describe('elbow connectors', () => {
  it('routes HVH when mostly horizontal, VHV when mostly vertical', () => {
    expect(elbowPoints({ x: 0, y: 0 }, { x: 100, y: 40 })).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 40 },
      { x: 100, y: 40 },
    ]);
    expect(elbowPoints({ x: 0, y: 0 }, { x: 40, y: 100 })).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 50 },
      { x: 40, y: 50 },
      { x: 40, y: 100 },
    ]);
  });

  it('renders a polyline with the head on the final segment', () => {
    const svg = shapeInnerSvg(
      {
        ...defaultShapeSpec('arrow'),
        route: 'elbow',
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 1,
      } as ShapeSpec,
      200,
      80,
    );
    expect(svg).toContain('<polyline');
    // Final segment is horizontal (HVH) → head base backs off in x only.
    expect(svg).toContain('M199,79'); // tip at the endpoint (default stroke 2 → inset 1)
    const pts = svg.match(/points="([^"]+)"/)![1].split(' ');
    expect(pts).toHaveLength(4);
  });

  it('approachDir is axis-aligned for elbows, radial for straight', () => {
    const straight = { ...defaultShapeSpec('line') } as ShapeSpec;
    const elbow = { ...straight, route: 'elbow' } as ShapeSpec;
    const d1 = approachDir(straight, { x: 0, y: 0 }, { x: 30, y: 40 });
    expect(d1.x).toBeCloseTo(0.6);
    expect(d1.y).toBeCloseTo(0.8);
    expect(approachDir(elbow, { x: 0, y: 0 }, { x: 100, y: 40 })).toEqual({ x: 1, y: 0 });
    expect(approachDir(elbow, { x: 0, y: 0 }, { x: 40, y: 100 })).toEqual({ x: 0, y: 1 });
  });
});

describe('connector labels', () => {
  it('hang centered on the route midpoint, svg overflow made visible', () => {
    const el = document.createElement('svg');
    el.setAttribute(
      SHAPE_ATTR,
      JSON.stringify({ ...defaultShapeSpec('arrow'), x1: 0, y1: 0.5, x2: 1, y2: 0.5 }),
    );
    el.style.width = '200px';
    el.style.height = '40px';
    renderShapeInto(el);
    const label = ensureShapeLabel(el)!;
    expect(label.className).toContain('re-shape-label');
    expect(el.style.overflow).toBe('visible');
    const fo = el.querySelector('foreignObject')!;
    const x = Number(fo.getAttribute('x'));
    const w = Number(fo.getAttribute('width'));
    expect(x + w / 2).toBeCloseTo(100, 0); // centered on midX
  });
});

describe('shape flip', () => {
  it('mirrors geometry in a <g>, label appended outside it', () => {
    const el = document.createElement('svg');
    el.setAttribute(
      SHAPE_ATTR,
      JSON.stringify({ kind: 'righttriangle', fill: '#123', strokeWidth: 0, flipX: true }),
    );
    el.style.width = '200px';
    el.style.height = '100px';
    renderShapeInto(el);
    const label = ensureShapeLabel(el)!;
    label.textContent = 'L';
    renderShapeInto(el);
    expect(el.innerHTML).toContain('<g transform="scale(-1, 1) translate(-200, 0)">');
    // The label is NOT inside the mirroring group — text stays readable.
    expect(el.querySelector('g foreignObject')).toBeNull();
    expect(el.querySelector('foreignObject')).toBeTruthy();
  });
});
