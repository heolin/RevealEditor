/**
 * Deterministic SVG chart renderer. Same spec + size + mode → byte-identical
 * SVG (no ids, no randomness, no timestamps), so charts baked into decks stay
 * git-diff-clean and re-render reproducibly.
 *
 * Visual rules follow the dataviz method: validated categorical palette in
 * fixed slot order (never cycled), thin marks (bars ≤24px, 4px rounded
 * data-end square at the baseline, 2px lines, ≥8px end markers, area fills
 * at 10% opacity), 2px geometric surface gaps between touching marks,
 * recessive 1px solid gridlines, clean comma'd ticks, a legend whenever
 * there are ≥2 series (never for one), selective direct labels only, and
 * text always in ink tokens — never the series color.
 */

export interface ChartSeries {
  name: string;
  values: number[];
  color?: string; // manual override; otherwise fixed slot order
}

export interface ChartSpec {
  type: 'bar' | 'stackedBar' | 'line' | 'area' | 'pie' | 'donut' | 'scatter';
  labels: string[];
  series: ChartSeries[];
  options?: {
    title?: string;
    valueLabels?: boolean; // selective: caps / endpoints / big slices only
    legend?: boolean; // default: auto (≥2 series)
  };
}

export interface ChartInk {
  mode: 'light' | 'dark';
  text: string;
  muted: string;
  grid: string;
  baseline: string;
}

// Validated categorical palettes (dataviz reference instance; slot order is
// the CVD-safety mechanism — never reorder, never cycle).
export const CHART_PALETTE_LIGHT = [
  '#2a78d6', '#1baf7a', '#eda100', '#008300', '#4a3aa7', '#e34948', '#e87ba4', '#eb6834',
];
export const CHART_PALETTE_DARK = [
  '#3987e5', '#199e70', '#c98500', '#008300', '#9085e9', '#e66767', '#d55181', '#d95926',
];

export function chartInk(mode: 'light' | 'dark'): ChartInk {
  return mode === 'light'
    ? { mode, text: '#52514e', muted: '#898781', grid: '#e1e0d9', baseline: '#c3c2b7' }
    : { mode, text: '#c3c2b7', muted: '#898781', grid: '#2c2c2a', baseline: '#383835' };
}

export function seriesColor(spec: ChartSpec, i: number, mode: 'light' | 'dark'): string {
  const manual = spec.series[i]?.color;
  if (manual) return manual;
  const palette = mode === 'light' ? CHART_PALETTE_LIGHT : CHART_PALETTE_DARK;
  return palette[i % palette.length];
}

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const GAP = 2; // surface gap between touching marks
const BAR_MAX = 24;

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (n: number) =>
  Number.isInteger(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { maximumFractionDigits: 2 });
const r2 = (n: number) => Math.round(n * 100) / 100;

/** "Nice" tick steps: 1/2/5 × 10^k covering [0|min, max]. */
function niceTicks(min: number, max: number, target = 5): number[] {
  if (min > 0) min = 0;
  if (max < 0) max = 0;
  if (min === max) max = min + 1;
  const span = max - min;
  const rawStep = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => span / s <= target) ?? 10 * mag;
  const ticks: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= max + step / 2; v += step) {
    ticks.push(r2(v));
  }
  return ticks;
}

interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
  body: string[];
}

/** Title + legend header; returns the remaining plot frame. */
function header(spec: ChartSpec, w: number, ink: ChartInk, mode: 'light' | 'dark'): Frame {
  const body: string[] = [];
  let top = 6;
  const title = spec.options?.title;
  if (title) {
    body.push(
      `<text x="8" y="${top + 14}" font-family='${FONT}' font-size="15" font-weight="600" fill="${ink.text}">${esc(title)}</text>`,
    );
    top += 26;
  }
  const showLegend = spec.options?.legend ?? spec.series.length >= 2;
  const legendItems =
    spec.type === 'pie' || spec.type === 'donut'
      ? spec.labels.map((l, i) => ({ label: l, color: seriesColor({ ...spec, series: spec.labels.map(() => ({ name: '', values: [] })) }, i, mode) }))
      : spec.series.map((s, i) => ({ label: s.name, color: seriesColor(spec, i, mode) }));
  if (showLegend && legendItems.length >= 2) {
    let x = 8;
    let rowY = top + 12;
    for (const item of legendItems) {
      const width = 16 + item.label.length * 6.6 + 14;
      if (x + width > w - 8 && x > 8) {
        x = 8;
        rowY += 17;
      }
      body.push(
        `<rect x="${x}" y="${rowY - 8.5}" width="10" height="10" rx="2" fill="${item.color}"/>` +
          `<text x="${x + 15}" y="${rowY}" font-family='${FONT}' font-size="11" fill="${ink.muted}">${esc(item.label)}</text>`,
      );
      x += width;
    }
    top = rowY + 12;
  }
  return { x: 0, y: top, w, h: 0, body };
}

/** Shared cartesian scaffold: y gridlines/ticks, x labels, baseline. */
function cartesian(
  spec: ChartSpec,
  frame: Frame,
  h: number,
  ink: ChartInk,
  yMin: number,
  yMax: number,
): {
  plot: { x: number; y: number; w: number; h: number };
  yPos: (v: number) => number;
  body: string[];
} {
  const ticks = niceTicks(yMin, yMax);
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const tickW = Math.max(...ticks.map((t) => fmt(t).length)) * 6.6 + 10;
  const plot = {
    x: 8 + tickW,
    y: frame.y + 8,
    w: frame.w - tickW - 20,
    h: h - frame.y - 8 - 22,
  };
  const yPos = (v: number) => plot.y + plot.h - ((v - lo) / (hi - lo)) * plot.h;
  const body: string[] = [];
  for (const t of ticks) {
    const y = r2(yPos(t));
    body.push(
      `<line x1="${plot.x}" y1="${y}" x2="${plot.x + plot.w}" y2="${y}" stroke="${t === 0 ? ink.baseline : ink.grid}" stroke-width="1"/>`,
      `<text x="${plot.x - 6}" y="${y + 3.5}" text-anchor="end" font-family='${FONT}' font-size="11" fill="${ink.muted}" style="font-variant-numeric: tabular-nums">${fmt(t)}</text>`,
    );
  }
  // X labels (skip some when crowded)
  const n = spec.labels.length;
  const slot = plot.w / Math.max(1, n);
  const every = Math.max(1, Math.ceil((n * 60) / plot.w));
  spec.labels.forEach((label, i) => {
    if (i % every !== 0) return;
    const cx = r2(plot.x + slot * (i + 0.5));
    body.push(
      `<text x="${cx}" y="${plot.y + plot.h + 15}" text-anchor="middle" font-family='${FONT}' font-size="11" fill="${ink.muted}">${esc(label)}</text>`,
    );
  });
  return { plot, yPos, body };
}

/** Bar with 4px rounded data-end, square at the baseline. */
function barPath(x: number, y: number, w: number, h: number, up: boolean): string {
  const r = Math.min(4, w / 2, h);
  x = r2(x); y = r2(y); w = r2(w); h = r2(h);
  if (h <= 0.5) return '';
  if (up) {
    return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
  }
  return `M${x},${y} L${x + w},${y} L${x + w},${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} L${x + r},${y + h} Q${x},${y + h} ${x},${y + h - r} Z`;
}

export function renderChart(spec: ChartSpec, width: number, height: number, mode: 'light' | 'dark'): string {
  const ink = chartInk(mode);
  const head = header(spec, width, ink, mode);
  const parts: string[] = [...head.body];
  head.w = width;

  if (spec.type === 'pie' || spec.type === 'donut') {
    parts.push(...renderPie(spec, head, height, ink, mode));
  } else {
    parts.push(...renderCartesian(spec, head, height, ink, mode));
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" ` +
    `width="${width}" height="${height}" role="img"${spec.options?.title ? ` aria-label="${esc(spec.options.title)}"` : ''}>` +
    parts.join('') +
    '</svg>'
  );
}

function renderCartesian(spec: ChartSpec, frame: Frame, h: number, ink: ChartInk, mode: 'light' | 'dark'): string[] {
  const numeric = spec.series.flatMap((s) => s.values.filter((v) => Number.isFinite(v)));
  const stacked = spec.type === 'stackedBar';
  const sums = spec.labels.map((_, i) =>
    spec.series.reduce((acc, s) => acc + Math.max(0, s.values[i] ?? 0), 0),
  );
  const yMax = stacked ? Math.max(0, ...sums) : Math.max(0, ...numeric);
  const yMin = stacked ? 0 : Math.min(0, ...numeric);
  const { plot, yPos, body } = cartesian(spec, frame, h, ink, yMin, yMax);
  const out = [...body];
  const n = spec.labels.length;
  const slot = plot.w / Math.max(1, n);
  const y0 = yPos(0);
  const labels = spec.options?.valueLabels ?? false;

  if (spec.type === 'bar' || spec.type === 'stackedBar') {
    const groupW = Math.min(
      stacked ? BAR_MAX : spec.series.length * BAR_MAX + (spec.series.length - 1) * GAP,
      slot * 0.72,
    );
    spec.labels.forEach((_, i) => {
      const groupX = plot.x + slot * (i + 0.5) - groupW / 2;
      if (stacked) {
        let acc = 0;
        spec.series.forEach((s, si) => {
          const v = Math.max(0, s.values[i] ?? 0);
          if (v <= 0) return;
          const yTop = yPos(acc + v);
          const yBottom = yPos(acc) - (acc > 0 ? GAP : 0); // geometric surface gap
          const isTop = acc + v >= sums[i] - 1e-9;
          out.push(
            `<path d="${isTop ? barPath(groupX, yTop, groupW, yBottom - yTop, true) : `M${r2(groupX)},${r2(yTop)} h${r2(groupW)} v${r2(yBottom - yTop)} h${r2(-groupW)} Z`}" fill="${seriesColor(spec, si, mode)}"/>`,
          );
          acc += v;
        });
        if (labels && sums[i] > 0) {
          out.push(
            `<text x="${r2(groupX + groupW / 2)}" y="${r2(yPos(sums[i]) - 5)}" text-anchor="middle" font-family='${FONT}' font-size="11" fill="${ink.text}">${fmt(sums[i])}</text>`,
          );
        }
      } else {
        const barW = (groupW - GAP * (spec.series.length - 1)) / spec.series.length;
        spec.series.forEach((s, si) => {
          const v = s.values[i] ?? 0;
          if (!Number.isFinite(v) || v === 0) return;
          const x = groupX + si * (barW + GAP);
          const yv = yPos(v);
          const up = v >= 0;
          out.push(
            `<path d="${barPath(x, up ? yv : y0, barW, Math.abs(y0 - yv), up)}" fill="${seriesColor(spec, si, mode)}"/>`,
          );
          if (labels) {
            out.push(
              `<text x="${r2(x + barW / 2)}" y="${r2(up ? yv - 5 : yv + 13)}" text-anchor="middle" font-family='${FONT}' font-size="11" fill="${ink.text}">${fmt(v)}</text>`,
            );
          }
        });
      }
    });
  } else if (spec.type === 'line' || spec.type === 'area') {
    spec.series.forEach((s, si) => {
      const color = seriesColor(spec, si, mode);
      const pts = spec.labels
        .map((_, i) => ({ i, v: s.values[i] }))
        .filter((p) => Number.isFinite(p.v))
        .map((p) => ({ x: r2(plot.x + slot * (p.i + 0.5)), y: r2(yPos(p.v!)) }));
      if (pts.length === 0) return;
      const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
      if (spec.type === 'area') {
        out.push(
          `<path d="${line} L${pts[pts.length - 1].x},${r2(y0)} L${pts[0].x},${r2(y0)} Z" fill="${color}" fill-opacity="0.1"/>`,
        );
      }
      out.push(
        `<path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`,
      );
      const end = pts[pts.length - 1];
      out.push(`<circle cx="${end.x}" cy="${end.y}" r="4" fill="${color}"/>`);
      if (labels) {
        const v = s.values.filter((x) => Number.isFinite(x)).pop();
        if (v !== undefined) {
          out.push(
            `<text x="${end.x + 7}" y="${end.y + 3.5}" font-family='${FONT}' font-size="11" fill="${ink.text}">${fmt(v)}</text>`,
          );
        }
      }
    });
  } else if (spec.type === 'scatter') {
    // x comes from numeric labels
    const xs = spec.labels.map((l) => parseFloat(l));
    const xTicks = niceTicks(Math.min(0, ...xs.filter(Number.isFinite)), Math.max(...xs.filter(Number.isFinite), 1));
    const xLo = xTicks[0];
    const xHi = xTicks[xTicks.length - 1];
    const xPos = (v: number) => plot.x + ((v - xLo) / (xHi - xLo)) * plot.w;
    spec.series.forEach((s, si) => {
      const color = seriesColor(spec, si, mode);
      xs.forEach((x, i) => {
        const v = s.values[i];
        if (!Number.isFinite(x) || !Number.isFinite(v)) return;
        out.push(`<circle cx="${r2(xPos(x))}" cy="${r2(yPos(v))}" r="4" fill="${color}" fill-opacity="0.85"/>`);
      });
    });
  }

  return out;
}

function renderPie(spec: ChartSpec, frame: Frame, h: number, ink: ChartInk, mode: 'light' | 'dark'): string[] {
  const out: string[] = [];
  const values = spec.labels.map((_, i) => Math.max(0, spec.series[0]?.values[i] ?? 0));
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return out;
  const cx = frame.w / 2;
  const cy = frame.y + (h - frame.y) / 2;
  const R = Math.min(frame.w, h - frame.y) / 2 - 16;
  const inner = spec.type === 'donut' ? R * 0.6 : 0;
  const gapAngle = GAP / R; // ~2px geometric gap between slices
  const palette = mode === 'light' ? CHART_PALETTE_LIGHT : CHART_PALETTE_DARK;
  let angle = -Math.PI / 2;

  values.forEach((v, i) => {
    if (v <= 0) return;
    const sweep = (v / total) * Math.PI * 2;
    const a0 = angle + gapAngle / 2;
    const a1 = angle + sweep - gapAngle / 2;
    angle += sweep;
    if (a1 <= a0) return;
    const color = spec.series[0]?.color && i === 0 ? spec.series[0].color : palette[i % palette.length];
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (r: number, a: number) => `${r2(cx + r * Math.cos(a))},${r2(cy + r * Math.sin(a))}`;
    const d = inner
      ? `M${p(R, a0)} A${r2(R)},${r2(R)} 0 ${large} 1 ${p(R, a1)} L${p(inner, a1)} A${r2(inner)},${r2(inner)} 0 ${large} 0 ${p(inner, a0)} Z`
      : `M${r2(cx)},${r2(cy)} L${p(R, a0)} A${r2(R)},${r2(R)} 0 ${large} 1 ${p(R, a1)} Z`;
    out.push(`<path d="${d}" fill="${color}"/>`);
    // Selective label: percentage inside slices big enough to fit it.
    if (spec.options?.valueLabels && a1 - a0 > 0.35) {
      const mid = (a0 + a1) / 2;
      const lr = inner ? (R + inner) / 2 : R * 0.62;
      const pct = Math.round((v / total) * 100);
      const fill = luminance(color) > 0.45 ? '#0b0b0b' : '#ffffff';
      out.push(
        `<text x="${r2(cx + lr * Math.cos(mid))}" y="${r2(cy + lr * Math.sin(mid) + 4)}" text-anchor="middle" font-family='${FONT}' font-size="12" font-weight="600" fill="${fill}">${pct}%</text>`,
      );
    }
  });
  return out;
}

function luminance(hex: string): number {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}
