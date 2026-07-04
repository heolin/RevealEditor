/**
 * Shapes: `<svg class="re-shape" data-re-shape="{params}">…</svg>`, absolutely
 * positioned in slide space. The params JSON is the editable truth; the SVG
 * content is regenerated from it at the element's current size.
 */
import { nanoid } from 'nanoid';
import type { StageCtx } from './commands';
import { commit, insertHtmlSnippet, setPreCommitHook } from './commands';
import {
  type AnchorId,
  elementAnchorPoint,
  ensureFreeLayoutSection,
  stageRect,
  writeStageRect,
} from './geometry';
import { useDeckStore } from '../state/deckStore';

export const SHAPE_ATTR = 'data-re-shape';
/** Stable element id connector attachments reference (file-format attr). */
export const REF_ATTR = 'data-re-id';

export type ShapeKind =
  // Base shapes:
  | 'rect'
  | 'roundrect'
  | 'ellipse'
  | 'triangle'
  | 'righttriangle'
  | 'parallelogram'
  | 'trapezoid'
  | 'diamond'
  | 'pentagon'
  | 'hexagon'
  | 'chevron'
  | 'star'
  | 'callout'
  // Connectors:
  | 'line'
  | 'arrow'
  // Flowchart primitives (docs/DIAGRAMMING.md phase 5). Names are geometric
  // where the geometry is generic; flowchart semantics live in the menu
  // labels (hexagon = preparation, triangle = extract, stadium = terminator):
  | 'stadium'
  | 'cylinder' // database
  | 'predefined' // predefined process
  | 'document'
  | 'multidocument'
  | 'onpage' // on-page connector (circle)
  | 'offpage' // off-page connector
  | 'manualop' // manual operation
  | 'manualinput'
  | 'display'
  | 'merge' // inverted triangle
  | 'collate'
  | 'sort'
  | 'delay'
  | 'internalstorage'
  | 'seqstorage' // sequential access storage (tape)
  | 'directstorage' // direct access storage (horizontal cylinder)
  | 'card'
  | 'papertape'
  | 'summing' // summing junction (circle + X)
  | 'orjunction'; // or junction (circle + +)

export const SHAPE_KINDS: ShapeKind[] = [
  'rect',
  'roundrect',
  'ellipse',
  'triangle',
  'righttriangle',
  'parallelogram',
  'trapezoid',
  'diamond',
  'pentagon',
  'hexagon',
  'chevron',
  'star',
  'callout',
  'line',
  'arrow',
  'stadium',
  'cylinder',
  'predefined',
  'document',
  'multidocument',
  'onpage',
  'offpage',
  'manualop',
  'manualinput',
  'display',
  'merge',
  'collate',
  'sort',
  'delay',
  'internalstorage',
  'seqstorage',
  'directstorage',
  'card',
  'papertape',
  'summing',
  'orjunction',
];

export type ArrowHeads = 'none' | 'start' | 'end' | 'both';

export interface ShapeSpec {
  kind: ShapeKind;
  fill: string; // 'none' for line/arrow
  stroke: string;
  strokeWidth: number;
  dash: 'solid' | 'dashed' | 'dotted';
  opacity: number; // 0..1
  radius?: number; // rect corner radius
  /** Line/arrow endpoints, normalized to the element box (0..1). Absent on
   *  specs from before the two-point model — defaults reproduce the old
   *  hardcoded diagonal (bottom-left → top-right) byte-identically. */
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  /** Arrowheads; lines default 'none', arrows 'end'. */
  heads?: ArrowHeads;
  /** Connector routing: straight (default), orthogonal elbow, or a
   *  quadratic curve. */
  route?: 'straight' | 'elbow' | 'curve';
  /** Curve bow: signed perpendicular offset of the control point as a
   *  fraction of the line length (default 0.3). Dragged via the mid grip. */
  bow?: number;
  /** Elbow bend: where the middle segment sits along the dominant axis,
   *  0..1 (default 0.5). Dragged via the mid grip. */
  bend?: number;
  /** Mirror the geometry (fill shapes only). Labels stay readable — the
   *  flip wraps the baked render in a <g>, never the foreignObject. */
  flipX?: boolean;
  flipY?: boolean;
  /** Endpoint back-off from a snapped anchor, px (absent = snapping lands
   *  exactly on the anchor). Applied at snap time during endpoint drags and
   *  whenever an attached endpoint re-derives from its target. */
  snapGap?: number;
  /** Sticky attachments: p1/p2 glued to a named anchor of another element
   *  (referenced by its data-re-id). Attached endpoints re-derive their
   *  position whenever the target moves or resizes; the stored x/y stay the
   *  baked result so the file presents without any runtime. */
  from?: ConnectorAttachment;
  to?: ConnectorAttachment;
}

export interface ConnectorAttachment {
  ref: string;
  anchor: AnchorId;
}

export interface Pt {
  x: number;
  y: number;
}

export function isLineKind(kind: ShapeKind): boolean {
  return kind === 'line' || kind === 'arrow';
}

/** Shape whose geometry is the two-point line model (line/arrow). */
export function isConnectorEl(el: Element): boolean {
  if (!isShapeEl(el)) return false;
  const spec = readShapeSpec(el);
  return !!spec && isLineKind(spec.kind);
}

/** Normalized endpoints with back-compat defaults (the old diagonal). */
export function specEndpoints(spec: ShapeSpec): { x1: number; y1: number; x2: number; y2: number } {
  return { x1: spec.x1 ?? 0, y1: spec.y1 ?? 1, x2: spec.x2 ?? 1, y2: spec.y2 ?? 0 };
}

/**
 * Orthogonal elbow route: mid-bend on the dominant axis (HVH when mostly
 * horizontal, VHV when mostly vertical). Waypoints stay inside the
 * endpoints' bbox, so the element box needs no growing.
 */
export function elbowPoints(p1: Pt, p2: Pt, bend = 0.5): Pt[] {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const mx = p1.x + dx * bend;
    return [p1, { x: mx, y: p1.y }, { x: mx, y: p2.y }, p2];
  }
  const my = p1.y + dy * bend;
  return [p1, { x: p1.x, y: my }, { x: p2.x, y: my }, p2];
}

/** Quadratic control point for a curved route: the midpoint pushed
 *  perpendicular by `bow` × line length. */
export function curveControl(p1: Pt, p2: Pt, bow: number): Pt {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    x: (p1.x + p2.x) / 2 + (-dy / len) * bow * len,
    y: (p1.y + p2.y) / 2 + (dx / len) * bow * len,
  };
}

/** Where a connector's route passes at its middle — labels + the mid grip. */
export function routeMidpoint(spec: ShapeSpec, p1: Pt, p2: Pt): Pt {
  if (spec.route === 'curve') {
    const c = curveControl(p1, p2, spec.bow ?? 0.3);
    // Quadratic Bézier at t = 0.5.
    return { x: 0.25 * p1.x + 0.5 * c.x + 0.25 * p2.x, y: 0.25 * p1.y + 0.5 * c.y + 0.25 * p2.y };
  }
  if (spec.route === 'elbow') {
    const pts = elbowPoints(p1, p2, spec.bend ?? 0.5);
    return { x: (pts[1].x + pts[2].x) / 2, y: (pts[1].y + pts[2].y) / 2 };
  }
  return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
}

/**
 * Unit direction from a (snapped) endpoint toward the other end, honoring
 * the route — a snap gap must back off along the segment that actually
 * enters the endpoint, which for an elbow is axis-aligned.
 */
export function approachDir(spec: ShapeSpec, from: Pt, toward: Pt): Pt {
  const dx = toward.x - from.x;
  const dy = toward.y - from.y;
  if (spec.route === 'elbow') {
    return Math.abs(dx) >= Math.abs(dy)
      ? { x: Math.sign(dx) || 1, y: 0 }
      : { x: 0, y: Math.sign(dy) || 1 };
  }
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

export function isShapeEl(el: Element): boolean {
  // Class fallback: decks saved while serialization stripped data-re-*
  // attributes (fixed since) lost the spec attr but kept the class.
  return (
    el.hasAttribute(SHAPE_ATTR) || (el.tagName === 'svg' && el.classList.contains('re-shape'))
  );
}

export function readShapeSpec(el: Element): ShapeSpec | null {
  const raw = el.getAttribute(SHAPE_ATTR);
  if (!raw) {
    if (!isShapeEl(el)) return null;
    // Orphaned shape (spec attr stripped by the old serializer): reconstruct
    // a best-effort spec from the baked markup — the next edit writes the
    // attr back and fully heals the file.
    const kind: ShapeKind = el.querySelector('ellipse')
      ? 'ellipse'
      : el.querySelector('polygon')
        ? 'arrow'
        : el.querySelector('line')
          ? 'line'
          : 'rect';
    const spec = defaultShapeSpec(kind);
    const painted = el.querySelector('rect, ellipse');
    const fill = painted?.getAttribute('fill');
    if (fill && fill !== 'none') spec.fill = fill;
    return spec;
  }
  try {
    return { ...defaultShapeSpec('rect'), ...(JSON.parse(raw) as Partial<ShapeSpec>) };
  } catch {
    return null;
  }
}

export function defaultShapeSpec(kind: ShapeKind): ShapeSpec {
  const line = isLineKind(kind);
  // House defaults: white fill with a 1px black border (diagram-neutral);
  // connectors draw 2px black (1px reads too faint at slide scale).
  return {
    kind,
    fill: line ? 'none' : '#ffffff',
    stroke: '#000000',
    strokeWidth: line ? 2 : 1,
    dash: 'solid',
    opacity: 1,
    radius: kind === 'rect' ? 4 : undefined,
    ...(line ? { x1: 0, y1: 1, x2: 1, y2: 0, heads: kind === 'arrow' ? 'end' : 'none' } : {}),
  } as ShapeSpec;
}

function dashArray(spec: ShapeSpec): string {
  if (spec.dash === 'dashed') return `${spec.strokeWidth * 3},${spec.strokeWidth * 2}`;
  if (spec.dash === 'dotted') return `${spec.strokeWidth},${spec.strokeWidth * 1.5}`;
  return '';
}

/**
 * The renderer core, PURE: spec + box size → inner SVG markup. Feeds both
 * the live element render (renderShapeInto) and the shapes-menu preview
 * icons — the gallery shows exactly what will be inserted. Must stay
 * deterministic: same spec + size → identical string (diff-clean saves).
 */
export function shapeInnerSvg(spec: ShapeSpec, w: number, h: number): string {
  const sw = spec.strokeWidth;
  const stroke =
    spec.stroke !== 'none' && sw > 0
      ? ` stroke="${spec.stroke}" stroke-width="${sw}"${dashArray(spec) ? ` stroke-dasharray="${dashArray(spec)}"` : ''}`
      : '';
  const inset = sw / 2;
  const fill = spec.fill;
  // Shorthands for the many-kinds section: l/t/rt/b = the inset box,
  // W/H = its span; r() rounds for stable output.
  const r = (n: number) => Math.round(n * 100) / 100;
  const l = inset;
  const t = inset;
  const rt = w - inset;
  const b = h - inset;
  const W = w - sw;
  const H = h - sw;
  const poly = (points: [number, number][]) =>
    `<polygon points="${points.map(([x, y]) => `${r(x)},${r(y)}`).join(' ')}" fill="${fill}"${stroke} stroke-linejoin="round"/>`;
  const path = (d: string, f = fill) => `<path d="${d}" fill="${f}"${stroke}/>`;
  // Detail marks (dividers, X/+ in junctions) need contrast on a filled
  // shape even without a stroke: fall back to a translucent dark overlay
  // (or currentColor for unfilled/preview rendering).
  const detail =
    sw > 0 && spec.stroke !== 'none'
      ? `${stroke} stroke-width="${sw}"`
      : ` stroke="${fill === 'none' ? 'currentColor' : '#00000059'}" stroke-width="2"`;
  const mark = (x1: number, y1: number, x2: number, y2: number) =>
    `<line x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}" fill="none"${detail}/>`;
  const circle = () => {
    const rr = (Math.min(W, H)) / 2;
    return {
      rr,
      svg: `<circle cx="${r(w / 2)}" cy="${r(h / 2)}" r="${r(rr)}" fill="${fill}"${stroke}/>`,
    };
  };
  /** Document outline with the classic wavy bottom, for a sub-box. */
  const docPath = (x0: number, y0: number, x1: number, y1: number) => {
    const a = (y1 - y0) * 0.12;
    const dw = x1 - x0;
    return path(
      `M ${r(x0)} ${r(y0)} L ${r(x1)} ${r(y0)} L ${r(x1)} ${r(y1 - a)} ` +
        `C ${r(x0 + dw * 0.66)} ${r(y1 - 3 * a)} ${r(x0 + dw * 0.33)} ${r(y1 + a)} ${r(x0)} ${r(y1 - a)} Z`,
    );
  };

  switch (spec.kind) {
    case 'rect':
      return `<rect x="${inset}" y="${inset}" width="${W}" height="${H}" rx="${spec.radius ?? 0}" fill="${fill}"${stroke}/>`;
    case 'roundrect':
      return `<rect x="${inset}" y="${inset}" width="${W}" height="${H}" rx="${spec.radius ?? r(Math.min(W, H) * 0.18)}" fill="${fill}"${stroke}/>`;
    case 'stadium':
      // Terminator: a rect whose corner radius is half its height (capsule).
      return `<rect x="${inset}" y="${inset}" width="${W}" height="${H}" rx="${H / 2}" fill="${fill}"${stroke}/>`;
    case 'ellipse':
      return `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2 - inset}" ry="${h / 2 - inset}" fill="${fill}"${stroke}/>`;
    case 'triangle':
      return poly([
        [w / 2, t],
        [rt, b],
        [l, b],
      ]);
    case 'righttriangle':
      return poly([
        [l, t],
        [rt, b],
        [l, b],
      ]);
    case 'parallelogram': {
      const o = W * 0.2;
      return poly([
        [l + o, t],
        [rt, t],
        [rt - o, b],
        [l, b],
      ]);
    }
    case 'trapezoid': {
      const o = W * 0.2;
      return poly([
        [l + o, t],
        [rt - o, t],
        [rt, b],
        [l, b],
      ]);
    }
    case 'diamond':
      return poly([
        [w / 2, t],
        [rt, h / 2],
        [w / 2, b],
        [l, h / 2],
      ]);
    case 'pentagon':
      return poly([
        [w / 2, t],
        [rt, t + H * 0.38],
        [l + W * 0.81, b],
        [l + W * 0.19, b],
        [l, t + H * 0.38],
      ]);
    case 'hexagon': {
      const o = Math.min(W * 0.2, H / 2);
      return poly([
        [l + o, t],
        [rt - o, t],
        [rt, h / 2],
        [rt - o, b],
        [l + o, b],
        [l, h / 2],
      ]);
    }
    case 'chevron': {
      const o = Math.min(W * 0.25, H / 2);
      return poly([
        [l, t],
        [rt - o, t],
        [rt, h / 2],
        [rt - o, b],
        [l, b],
        [l + o, h / 2],
      ]);
    }
    case 'star': {
      // 5-point star; inner radius at 0.42 of the outer.
      const cx = w / 2;
      const cy = h / 2;
      const points: [number, number][] = [];
      for (let i = 0; i < 10; i++) {
        const a = ((-90 + i * 36) * Math.PI) / 180;
        const f = i % 2 ? 0.42 : 1;
        points.push([cx + Math.cos(a) * (W / 2) * f, cy + Math.sin(a) * (H / 2) * f]);
      }
      return poly(points);
    }
    case 'callout': {
      // Speech bubble: rounded body over the top ~72%, tail bottom-left.
      const r0 = Math.min(W, H) * 0.1;
      const yb = t + H * 0.72;
      return path(
        `M ${r(l + r0)} ${r(t)} L ${r(rt - r0)} ${r(t)} A ${r(r0)} ${r(r0)} 0 0 1 ${r(rt)} ${r(t + r0)} ` +
          `L ${r(rt)} ${r(yb - r0)} A ${r(r0)} ${r(r0)} 0 0 1 ${r(rt - r0)} ${r(yb)} ` +
          `L ${r(l + W * 0.38)} ${r(yb)} L ${r(l + W * 0.18)} ${r(b)} L ${r(l + W * 0.24)} ${r(yb)} ` +
          `L ${r(l + r0)} ${r(yb)} A ${r(r0)} ${r(r0)} 0 0 1 ${r(l)} ${r(yb - r0)} ` +
          `L ${r(l)} ${r(t + r0)} A ${r(r0)} ${r(r0)} 0 0 1 ${r(l + r0)} ${r(t)} Z`,
      );
    }
    case 'cylinder': {
      // Database: body with elliptical top/bottom + visible top rim. The rim
      // shades with a translucent overlay so it reads even without a stroke.
      const rx = W / 2;
      const ry = Math.min(H * 0.18, rx);
      const top = inset + ry;
      const bot = h - inset - ry;
      return (
        `<path d="M ${r(inset)} ${r(top)} A ${r(rx)} ${r(ry)} 0 0 1 ${r(w - inset)} ${r(top)} L ${r(w - inset)} ${r(bot)} A ${r(rx)} ${r(ry)} 0 0 1 ${r(inset)} ${r(bot)} Z" fill="${fill}"${stroke}/>` +
        `<ellipse cx="${r(w / 2)}" cy="${r(top)}" rx="${r(rx)}" ry="${r(ry)}" fill="${fill === 'none' ? 'none' : '#00000026'}"${stroke}/>`
      );
    }
    case 'directstorage': {
      // Horizontal cylinder, rim on the left.
      const rx = Math.min(W * 0.18, H / 2);
      return (
        path(
          `M ${r(l + rx)} ${r(t)} L ${r(rt - rx)} ${r(t)} A ${r(rx)} ${r(H / 2)} 0 0 1 ${r(rt - rx)} ${r(b)} L ${r(l + rx)} ${r(b)} A ${r(rx)} ${r(H / 2)} 0 0 1 ${r(l + rx)} ${r(t)} Z`,
        ) +
        `<ellipse cx="${r(l + rx)}" cy="${r(h / 2)}" rx="${r(rx)}" ry="${r(H / 2)}" fill="${fill === 'none' ? 'none' : '#00000026'}"${stroke}/>`
      );
    }
    case 'predefined': {
      const o = W * 0.1;
      return (
        `<rect x="${inset}" y="${inset}" width="${W}" height="${H}" fill="${fill}"${stroke}/>` +
        mark(l + o, t, l + o, b) +
        mark(rt - o, t, rt - o, b)
      );
    }
    case 'internalstorage':
      return (
        `<rect x="${inset}" y="${inset}" width="${W}" height="${H}" fill="${fill}"${stroke}/>` +
        mark(l + W * 0.15, t, l + W * 0.15, b) +
        mark(l, t + H * 0.2, rt, t + H * 0.2)
      );
    case 'document':
      return docPath(l, t, rt, b);
    case 'multidocument': {
      const o = Math.min(W, H) * 0.1;
      return (
        docPath(l + 2 * o, t, rt, b - 2 * o) +
        docPath(l + o, t + o, rt - o, b - o) +
        docPath(l, t + 2 * o, rt - 2 * o, b)
      );
    }
    case 'onpage':
      return circle().svg;
    case 'summing': {
      const { rr, svg } = circle();
      const d = rr / Math.SQRT2;
      const cx = w / 2;
      const cy = h / 2;
      return svg + mark(cx - d, cy - d, cx + d, cy + d) + mark(cx - d, cy + d, cx + d, cy - d);
    }
    case 'orjunction': {
      const { rr, svg } = circle();
      const cx = w / 2;
      const cy = h / 2;
      return svg + mark(cx - rr, cy, cx + rr, cy) + mark(cx, cy - rr, cx, cy + rr);
    }
    case 'seqstorage': {
      // Tape reel: circle with a tangent run-out at the bottom right.
      const { rr, svg } = circle();
      return svg + mark(w / 2, h / 2 + rr, w / 2 + rr, h / 2 + rr);
    }
    case 'offpage':
      return poly([
        [l, t],
        [rt, t],
        [rt, t + H * 0.6],
        [w / 2, b],
        [l, t + H * 0.6],
      ]);
    case 'manualop': {
      const o = W * 0.2;
      return poly([
        [l, t],
        [rt, t],
        [rt - o, b],
        [l + o, b],
      ]);
    }
    case 'manualinput':
      return poly([
        [l, t + H * 0.25],
        [rt, t],
        [rt, b],
        [l, b],
      ]);
    case 'display': {
      const bulge = W * 0.15;
      return path(
        `M ${r(l)} ${r(h / 2)} L ${r(l + W * 0.18)} ${r(t)} L ${r(rt - bulge)} ${r(t)} ` +
          `A ${r(bulge)} ${r(H / 2)} 0 0 1 ${r(rt - bulge)} ${r(b)} L ${r(l + W * 0.18)} ${r(b)} Z`,
      );
    }
    case 'merge':
      return poly([
        [l, t],
        [rt, t],
        [w / 2, b],
      ]);
    case 'collate':
      return (
        poly([
          [l, t],
          [rt, t],
          [w / 2, h / 2],
        ]) +
        poly([
          [l, b],
          [rt, b],
          [w / 2, h / 2],
        ])
      );
    case 'sort':
      return (
        poly([
          [w / 2, t],
          [rt, h / 2],
          [w / 2, b],
          [l, h / 2],
        ]) + mark(l, h / 2, rt, h / 2)
      );
    case 'delay': {
      const rr = Math.min(W * 0.5, H / 2);
      return path(
        `M ${r(l)} ${r(t)} L ${r(rt - rr)} ${r(t)} A ${r(rr)} ${r(H / 2)} 0 0 1 ${r(rt - rr)} ${r(b)} L ${r(l)} ${r(b)} Z`,
      );
    }
    case 'card': {
      const c = Math.min(W * 0.25, H * 0.4);
      return poly([
        [l + c, t],
        [rt, t],
        [rt, b],
        [l, b],
        [l, t + c],
      ]);
    }
    case 'papertape': {
      const a = H * 0.12;
      return path(
        `M ${r(l)} ${r(t + a)} C ${r(l + W * 0.33)} ${r(t - a)} ${r(l + W * 0.66)} ${r(t + 3 * a)} ${r(rt)} ${r(t + a)} ` +
          `L ${r(rt)} ${r(b - a)} C ${r(l + W * 0.66)} ${r(b + a)} ${r(l + W * 0.33)} ${r(b - 3 * a)} ${r(l)} ${r(b - a)} Z`,
      );
    }
    case 'line':
    case 'arrow': {
      // Two-point model: normalized endpoints mapped into the box, inset by
      // the stroke radius so caps/heads aren't clipped by the viewBox. Heads
      // are filled paths (no <marker> — markers need document-unique ids,
      // which collide when a deck holds several arrows).
      const p = specEndpoints(spec);
      const x1 = inset + p.x1 * (w - sw);
      const y1 = inset + p.y1 * (h - sw);
      const x2 = inset + p.x2 * (w - sw);
      const y2 = inset + p.y2 * (h - sw);
      const heads = spec.heads ?? (spec.kind === 'arrow' ? 'end' : 'none');
      if (spec.route === 'curve') {
        // Quadratic curve; heads align with the end tangents (toward the
        // control point) and simply cover the curve's tip — no shortening.
        const p1c = { x: x1, y: y1 };
        const p2c = { x: x2, y: y2 };
        const c = curveControl(p1c, p2c, spec.bow ?? 0.3);
        let headPaths = '';
        const headAt = (tip: Pt, from: Pt) => {
          const head = Math.max(10, sw * 4);
          const angle = Math.atan2(tip.y - from.y, tip.x - from.x);
          const px = head * 0.45 * Math.cos(angle + Math.PI / 2);
          const py = head * 0.45 * Math.sin(angle + Math.PI / 2);
          const bx = tip.x - head * Math.cos(angle);
          const by = tip.y - head * Math.sin(angle);
          headPaths += `<path d="M${r(tip.x)},${r(tip.y)} L${r(bx + px)},${r(by + py)} L${r(bx - px)},${r(by - py)} Z" fill="${spec.stroke}"/>`;
        };
        if (heads === 'end' || heads === 'both') headAt(p2c, c);
        if (heads === 'start' || heads === 'both') headAt(p1c, c);
        return (
          `<path d="M${r(x1)},${r(y1)} Q${r(c.x)},${r(c.y)} ${r(x2)},${r(y2)}" fill="none"${stroke} stroke-linecap="round"/>` +
          headPaths
        );
      }
      if (spec.route === 'elbow') {
        // Orthogonal route: heads align with the segment they terminate.
        const pts = elbowPoints({ x: x1, y: y1 }, { x: x2, y: y2 }, spec.bend ?? 0.5);
        let headPaths = '';
        const headAt = (tip: Pt, prev: Pt): Pt => {
          const head = Math.max(10, sw * 4);
          const angle = Math.atan2(tip.y - prev.y, tip.x - prev.x);
          const px = head * 0.45 * Math.cos(angle + Math.PI / 2);
          const py = head * 0.45 * Math.sin(angle + Math.PI / 2);
          const bx = tip.x - head * Math.cos(angle);
          const by = tip.y - head * Math.sin(angle);
          headPaths += `<path d="M${r(tip.x)},${r(tip.y)} L${r(bx + px)},${r(by + py)} L${r(bx - px)},${r(by - py)} Z" fill="${spec.stroke}"/>`;
          return { x: bx, y: by };
        };
        if (heads === 'end' || heads === 'both') {
          pts[pts.length - 1] = headAt(pts[pts.length - 1], pts[pts.length - 2]);
        }
        if (heads === 'start' || heads === 'both') pts[0] = headAt(pts[0], pts[1]);
        return (
          `<polyline points="${pts.map((q) => `${r(q.x)},${r(q.y)}`).join(' ')}" fill="none"${stroke} stroke-linecap="round" stroke-linejoin="round"/>` +
          headPaths
        );
      }
      if (heads === 'none') {
        return `<line x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}"${stroke} stroke-linecap="round"/>`;
      }
      const head = Math.max(10, sw * 4);
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const px = head * 0.45 * Math.cos(angle + Math.PI / 2);
      const py = head * 0.45 * Math.sin(angle + Math.PI / 2);
      // The line stops at each head's base so it doesn't poke through.
      let [sx, sy, ex, ey] = [x1, y1, x2, y2];
      let headPaths = '';
      if (heads === 'end' || heads === 'both') {
        const bx = x2 - head * Math.cos(angle);
        const by = y2 - head * Math.sin(angle);
        headPaths += `<path d="M${r(x2)},${r(y2)} L${r(bx + px)},${r(by + py)} L${r(bx - px)},${r(by - py)} Z" fill="${spec.stroke}"/>`;
        ex = bx;
        ey = by;
      }
      if (heads === 'start' || heads === 'both') {
        const bx = x1 + head * Math.cos(angle);
        const by = y1 + head * Math.sin(angle);
        headPaths += `<path d="M${r(x1)},${r(y1)} L${r(bx + px)},${r(by + py)} L${r(bx - px)},${r(by - py)} Z" fill="${spec.stroke}"/>`;
        sx = bx;
        sy = by;
      }
      return (
        `<line x1="${r(sx)}" y1="${r(sy)}" x2="${r(ex)}" y2="${r(ey)}"${stroke} stroke-linecap="round"/>` +
        headPaths
      );
    }
  }
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

  // Labels survive re-bakes: the render output is regenerated wholesale, but
  // the foreignObject label is user content — carry it across and re-fit it
  // to the new box. Fill shapes centre the label in the box; connectors hang
  // it on the route midpoint (same point for straight and elbow routes).
  const label = el.querySelector('foreignObject');
  let inner = shapeInnerSvg(spec, w, h);
  if ((spec.flipX || spec.flipY) && !isLineKind(spec.kind)) {
    // Mirror the geometry only — the label is appended OUTSIDE this group.
    const sx = spec.flipX ? -1 : 1;
    const sy = spec.flipY ? -1 : 1;
    inner = `<g transform="scale(${sx}, ${sy}) translate(${spec.flipX ? -w : 0}, ${spec.flipY ? -h : 0})">${inner}</g>`;
  }
  el.innerHTML = inner;
  if (label) {
    if (isLineKind(spec.kind)) {
      const p = specEndpoints(spec);
      const mid = routeMidpoint(
        spec,
        { x: p.x1 * w, y: p.y1 * h },
        { x: p.x2 * w, y: p.y2 * h },
      );
      const midX = mid.x;
      const midY = mid.y;
      const lw = Math.max(60, Math.round(w * 0.5));
      const lh = Math.max(32, Math.round(Math.min(h * 0.4, 72)));
      label.setAttribute('x', String(Math.round(midX - lw / 2)));
      label.setAttribute('y', String(Math.round(midY - lh / 2)));
      label.setAttribute('width', String(lw));
      label.setAttribute('height', String(lh));
    } else {
      const padX = Math.round(sw + w * 0.08);
      const padY = Math.round(sw + h * 0.08);
      label.setAttribute('x', String(padX));
      label.setAttribute('y', String(padY));
      label.setAttribute('width', String(w - padX * 2));
      label.setAttribute('height', String(h - padY * 2));
    }
    el.appendChild(label);
  }
  el.style.opacity = spec.opacity === 1 ? '' : String(spec.opacity);
  if (el.getAttribute('style') === '') el.removeAttribute('style');
}

export const SHAPE_LABEL_CLASS = 're-shape-label';

/**
 * The editable label of a shape, creating it when absent. Labels are a
 * foreignObject + centered flex div — plain HTML-in-SVG that presents
 * anywhere; text sessions edit the div like any text element. Fill shapes
 * center it; connectors hang it on the route midpoint (their svg gets
 * overflow: visible — a near-horizontal line's box is thinner than a line
 * of text).
 */
export function ensureShapeLabel(el: HTMLElement): HTMLElement | null {
  const spec = readShapeSpec(el);
  if (!spec) return null;
  let div = el.querySelector(`.${SHAPE_LABEL_CLASS}`) as HTMLElement | null;
  if (!div) {
    if (isLineKind(spec.kind)) el.style.overflow = 'visible';
    el.insertAdjacentHTML(
      'beforeend',
      `<foreignObject><div class="${SHAPE_LABEL_CLASS}" xmlns="http://www.w3.org/1999/xhtml" ` +
        `style="display: flex; align-items: center; justify-content: center; ` +
        `width: 100%; height: 100%; text-align: center; overflow: hidden;"></div></foreignObject>`,
    );
    renderShapeInto(el); // size the fresh foreignObject to the box
    div = el.querySelector(`.${SHAPE_LABEL_CLASS}`) as HTMLElement | null;
  }
  return div;
}

/** Session-scoped style memory: newly inserted shapes inherit the last
 *  styling applied to their kind (never persisted — files stay the truth). */
const STYLE_FIELDS = ['fill', 'stroke', 'strokeWidth', 'dash', 'opacity', 'radius'] as const;
const lastStyle = new Map<ShapeKind, Partial<ShapeSpec>>();

export function writeShapeSpec(ctx: StageCtx, el: HTMLElement, patch: Partial<ShapeSpec>): void {
  const spec = { ...(readShapeSpec(el) ?? defaultShapeSpec('rect')), ...patch };
  el.setAttribute(SHAPE_ATTR, JSON.stringify(spec));
  if (STYLE_FIELDS.some((f) => f in patch)) {
    const mem: Partial<ShapeSpec> = {};
    for (const f of STYLE_FIELDS) {
      if (spec[f] !== undefined) (mem as Record<string, unknown>)[f] = spec[f];
    }
    lastStyle.set(spec.kind, mem);
  }
  renderShapeInto(el);
  commit(ctx);
}

/** A connector's endpoints in stage coords, from its box + normalized spec. */
export function connectorEndpoints(ctx: StageCtx, el: HTMLElement): { p1: Pt; p2: Pt } {
  const box = stageRect(ctx, el);
  const p = specEndpoints(readShapeSpec(el) ?? defaultShapeSpec('line'));
  return {
    p1: { x: box.left + p.x1 * box.width, y: box.top + p.y1 * box.height },
    p2: { x: box.left + p.x2 * box.width, y: box.top + p.y2 * box.height },
  };
}

/** Near-horizontal/vertical lines still need a hittable, unclipped box. */
const MIN_SPAN = 8;

/** Bounding box of two endpoints, each axis at least MIN_SPAN (centered). */
export function endpointBox(
  p1: Pt,
  p2: Pt,
): { left: number; top: number; width: number; height: number } {
  let left = Math.min(p1.x, p2.x);
  let width = Math.abs(p2.x - p1.x);
  if (width < MIN_SPAN) {
    left = (p1.x + p2.x) / 2 - MIN_SPAN / 2;
    width = MIN_SPAN;
  }
  let top = Math.min(p1.y, p2.y);
  let height = Math.abs(p2.y - p1.y);
  if (height < MIN_SPAN) {
    top = (p1.y + p2.y) / 2 - MIN_SPAN / 2;
    height = MIN_SPAN;
  }
  return { left, top, width, height };
}

/**
 * Live drag preview for a line/arrow: from two stage-space endpoints, build
 * the same box + SVG that pointer-up will commit (defaults styling). Pure —
 * returns the bounding box (stage px) and outer `<svg>` markup that fills its
 * container, so the overlay preview matches the final shape.
 */
export function previewLineSvg(
  kind: ShapeKind,
  p1: Pt,
  p2: Pt,
): { box: { left: number; top: number; width: number; height: number }; svg: string } {
  const box = endpointBox(p1, p2);
  const w = Math.max(8, Math.round(box.width));
  const h = Math.max(8, Math.round(box.height));
  const norm = (v: number, o: number, span: number) =>
    span ? Math.round(((v - o) / span) * 1000) / 1000 : 0;
  const spec = {
    ...defaultShapeSpec(kind),
    x1: norm(p1.x, box.left, box.width),
    y1: norm(p1.y, box.top, box.height),
    x2: norm(p2.x, box.left, box.width),
    y2: norm(p2.y, box.top, box.height),
  } as ShapeSpec;
  const svg = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" width="100%" height="100%">${shapeInnerSvg(spec, w, h)}</svg>`;
  return { box, svg };
}

/**
 * Reposition a connector from two stage-coord endpoints: the element box
 * becomes their bounding box and the spec stores box-normalized endpoints
 * (exactly 0/1 except on a degenerate axis). Re-renders; NO commit — the
 * gesture commits once on pointer-up.
 */
export function writeConnectorEndpoints(ctx: StageCtx, el: HTMLElement, p1: Pt, p2: Pt): void {
  const box = endpointBox(p1, p2);
  writeStageRect(ctx, el, box);
  const norm = (v: number, o: number, span: number) => Math.round(((v - o) / span) * 1000) / 1000;
  const spec = readShapeSpec(el) ?? defaultShapeSpec('line');
  const next: ShapeSpec = {
    ...spec,
    x1: norm(p1.x, box.left, box.width),
    y1: norm(p1.y, box.top, box.height),
    x2: norm(p2.x, box.left, box.width),
    y2: norm(p2.y, box.top, box.height),
  };
  el.setAttribute(SHAPE_ATTR, JSON.stringify(next));
  renderShapeInto(el);
}

/* ---------- sticky attachments (docs/DIAGRAMMING.md phase 4) ---------- */

/**
 * The stable id an attachment references, stamping one if needed. An id
 * duplicated by copy/paste gets re-minted — refs must be unambiguous within
 * the slide.
 */
export function ensureRefId(section: HTMLElement, el: HTMLElement): string {
  const existing = el.getAttribute(REF_ATTR);
  if (existing && section.querySelectorAll(`[${REF_ATTR}="${existing}"]`).length === 1) {
    return existing;
  }
  const id = nanoid(8);
  el.setAttribute(REF_ATTR, id);
  return id;
}

/** Set/clear one end's attachment in the spec. NO commit — gesture-scoped. */
export function setAttachment(
  el: HTMLElement,
  end: 'from' | 'to',
  att: ConnectorAttachment | null,
): void {
  const spec = readShapeSpec(el);
  if (!spec) return;
  el.setAttribute(SHAPE_ATTR, JSON.stringify({ ...spec, [end]: att ?? undefined }));
}

/**
 * Detach the ends of a manually-moved connector — EXCEPT ends whose target
 * moves along in the same gesture (moving a selection containing both the
 * box and its arrows keeps the diagram wired). NO commit.
 */
export function detachForMove(ctx: StageCtx, el: HTMLElement, moving: Set<Element>): void {
  const spec = readShapeSpec(el);
  if (!spec || (!spec.from && !spec.to)) return;
  const keep = (att?: ConnectorAttachment) => {
    if (!att) return undefined;
    const target = ctx.section.querySelector(`[${REF_ATTR}="${att.ref}"]`);
    return target && moving.has(target) ? att : undefined;
  };
  const next = { ...spec, from: keep(spec.from), to: keep(spec.to) };
  if (next.from !== spec.from || next.to !== spec.to) {
    el.setAttribute(SHAPE_ATTR, JSON.stringify(next));
  }
}

/** Ignore sub-px churn from box rounding + 3-decimal endpoint storage. */
const RECONCILE_EPS = 0.75;

/**
 * Re-derive attached connector endpoints from their targets' current boxes.
 * Runs as the mutation funnel's pre-commit hook — any command that moves or
 * resizes a target drags its connectors along in the SAME commit (one undo
 * step) — and live during move/resize gestures for immediate feedback.
 * Deleted targets detach (in the same snapshot as the deletion). Never
 * commits itself.
 */
export function reconcileConnectors(ctx: StageCtx): void {
  // Cheap bail: '"ref"' only appears in specs that carry attachments.
  if (!ctx.section.querySelector(`[${SHAPE_ATTR}*='"ref"']`)) return;
  for (const node of Array.from(ctx.section.querySelectorAll(`[${SHAPE_ATTR}]`))) {
    const el = node as HTMLElement;
    const spec = readShapeSpec(el);
    if (!spec || !isLineKind(spec.kind) || (!spec.from && !spec.to)) continue;
    const { p1, p2 } = connectorEndpoints(ctx, el);
    const resolve = (att?: ConnectorAttachment) => {
      if (!att) return null;
      const target = ctx.section.querySelector(`[${REF_ATTR}="${att.ref}"]`);
      return target ? elementAnchorPoint(ctx, target as HTMLElement, att.anchor) : null;
    };
    const a1 = resolve(spec.from);
    const a2 = resolve(spec.to);
    if ((spec.from && !a1) || (spec.to && !a2)) {
      el.setAttribute(
        SHAPE_ATTR,
        JSON.stringify({ ...spec, from: a1 ? spec.from : undefined, to: a2 ? spec.to : undefined }),
      );
    }
    const gap = spec.snapGap ?? 0;
    const b1 = a1 ?? p1;
    const b2 = a2 ?? p2;
    const backOff = (from: Pt, toward: Pt): Pt => {
      if (Math.hypot(toward.x - from.x, toward.y - from.y) <= gap * 2) {
        return from; // too short to back off without inverting
      }
      const dir = approachDir(spec, from, toward);
      return { x: from.x + dir.x * gap, y: from.y + dir.y * gap };
    };
    const n1 = a1 && gap > 0 ? backOff(a1, b2) : b1;
    const n2 = a2 && gap > 0 ? backOff(a2, b1) : b2;
    if (
      Math.hypot(n1.x - p1.x, n1.y - p1.y) > RECONCILE_EPS ||
      Math.hypot(n2.x - p2.x, n2.y - p2.y) > RECONCILE_EPS
    ) {
      writeConnectorEndpoints(ctx, el, n1, n2);
    }
  }
}

// Every path through the mutation funnel reconciles before serializing.
setPreCommitHook(reconcileConnectors);

/** Kinds whose canonical form is a circle insert as a small square box. */
const SQUARE_KINDS: ShapeKind[] = ['onpage', 'summing', 'orjunction', 'seqstorage'];

/**
 * Insert a shape. `place` comes from the draw gesture: a dragged rect (or
 * p1→p2 for connectors); a plain click centers the default size on `at`.
 * No placement at all centers on the slide.
 */
export function insertShape(
  ctx: StageCtx,
  kind: ShapeKind,
  place?: {
    rect?: { left: number; top: number; width: number; height: number };
    p1?: Pt;
    p2?: Pt;
    at?: Pt;
  },
): HTMLElement | null {
  const design = useDeckStore.getState().meta?.config ?? { width: 960, height: 700 };
  ensureFreeLayoutSection(ctx, design.height);
  const square = SQUARE_KINDS.includes(kind);
  let w = square ? 120 : 240;
  let h = square ? 120 : isLineKind(kind) ? 120 : 160;
  let left = Math.round((design.width - w) / 2);
  let top = Math.round((design.height - h) / 2);
  const spec: ShapeSpec = { ...defaultShapeSpec(kind), ...(lastStyle.get(kind) ?? {}) };
  if (place?.p1 && place?.p2 && isLineKind(kind)) {
    const box = endpointBox(place.p1, place.p2);
    left = Math.round(box.left);
    top = Math.round(box.top);
    w = Math.round(box.width);
    h = Math.round(box.height);
    const norm = (v: number, o: number, span: number) =>
      Math.round(((v - o) / span) * 1000) / 1000;
    spec.x1 = norm(place.p1.x, box.left, box.width);
    spec.y1 = norm(place.p1.y, box.top, box.height);
    spec.x2 = norm(place.p2.x, box.left, box.width);
    spec.y2 = norm(place.p2.y, box.top, box.height);
  } else if (place?.rect) {
    left = Math.round(place.rect.left);
    top = Math.round(place.rect.top);
    w = Math.max(16, Math.round(place.rect.width));
    h = Math.max(16, Math.round(place.rect.height));
  } else if (place?.at) {
    left = Math.round(place.at.x - w / 2);
    top = Math.round(place.at.y - h / 2);
  }
  const el = insertHtmlSnippet(
    ctx,
    `<svg class="re-shape" xmlns="http://www.w3.org/2000/svg" style="position: absolute; left: ${left}px; top: ${top}px; width: ${w}px; height: ${h}px;"></svg>`,
    null,
    false, // commit once below — one undo step for the whole insert
  );
  if (el) {
    // New shapes inherit the last styling the user gave this kind.
    el.setAttribute(SHAPE_ATTR, JSON.stringify(spec));
    renderShapeInto(el);
    commit(ctx);
  }
  return el;
}
