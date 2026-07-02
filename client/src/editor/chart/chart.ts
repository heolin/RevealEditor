/**
 * Chart blocks: `<figure class="re-chart" data-re-chart="{spec}">baked SVG</figure>`.
 * The spec is the editable truth (principle #5 — re-editable from the file
 * alone); the SVG is the standalone render that presents anywhere with zero
 * runtime.
 */
import type { StageCtx } from '../commands';
import { commit, insertHtmlSnippet } from '../commands';
import { useDeckStore } from '../../state/deckStore';
import { themeColors } from '../../model/themeColors';
import { type ChartSpec, renderChart } from './renderChart';

export const CHART_ATTR = 'data-re-chart';

export function isChartEl(el: Element): boolean {
  return el.hasAttribute(CHART_ATTR);
}

export function readChartSpec(el: Element): ChartSpec | null {
  const raw = el.getAttribute(CHART_ATTR);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ChartSpec;
  } catch {
    return null;
  }
}

/** The slide's effective background color (per-slide attr, else theme). */
export function slideBackgroundColor(ctx: StageCtx): string {
  const attr = ctx.section.getAttribute('data-background-color');
  if (attr) return attr;
  // Custom-styled decks paint the viewport themselves — read what actually
  // renders rather than guessing from the theme map.
  const painted = ctx.doc.defaultView?.getComputedStyle(ctx.doc.body).backgroundColor;
  if (painted && painted !== 'rgba(0, 0, 0, 0)' && painted !== 'transparent') return painted;
  return themeColors(useDeckStore.getState().meta?.theme ?? null).bg;
}

/** Ink mode from the slide's effective background (theme or per-slide color). */
export function chartMode(ctx: StageCtx): 'light' | 'dark' {
  const bg = slideBackgroundColor(ctx);
  let r: number, g: number, b: number;
  const hex = bg.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  const rgb = bg.match(/^rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255;
  } else if (rgb) {
    r = +rgb[1]; g = +rgb[2]; b = +rgb[3];
  } else {
    return 'dark';
  }
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.5 ? 'light' : 'dark';
}

export function chartSize(el: HTMLElement): { width: number; height: number } {
  const width = parseInt(el.style.width, 10) || 640;
  const height = parseInt(el.style.height, 10) || 400;
  return { width, height };
}

/** Re-bake the SVG from spec + current size (resize, mode change, data edit). */
export function refreshChart(ctx: StageCtx, el: HTMLElement): void {
  const spec = readChartSpec(el);
  if (!spec) return;
  const { width, height } = chartSize(el);
  el.innerHTML = renderChart(spec, width, height, chartMode(ctx));
}

/** Write a new spec (from the chart editor) and re-bake. */
export function writeChartSpec(ctx: StageCtx, el: HTMLElement, spec: ChartSpec): void {
  el.setAttribute(CHART_ATTR, JSON.stringify(spec));
  refreshChart(ctx, el);
  commit(ctx);
}

export function defaultChartSpec(): ChartSpec {
  return {
    type: 'bar',
    labels: ['Q1', 'Q2', 'Q3', 'Q4'],
    series: [
      { name: 'Series A', values: [12, 19, 14, 23] },
      { name: 'Series B', values: [8, 11, 17, 15] },
    ],
    options: {},
  };
}

export function insertChart(ctx: StageCtx, after: HTMLElement | null): HTMLElement | null {
  const el = insertHtmlSnippet(
    ctx,
    `<figure class="re-chart" style="width: 640px; height: 400px; margin: 0 auto;"></figure>`,
    after,
    false, // commit once below — one undo step for the whole insert
  );
  if (el) {
    el.setAttribute(CHART_ATTR, JSON.stringify(defaultChartSpec()));
    refreshChart(ctx, el);
    commit(ctx);
  }
  return el;
}

/** Parse pasted TSV/CSV into labels + series (first row = header, first col = labels). */
export function parseDelimited(text: string): { labels: string[]; series: { name: string; values: number[] }[] } | null {
  const rows = text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(line.includes('\t') ? '\t' : ','))
    .filter((r) => r.length > 0);
  if (rows.length < 2 || rows[0].length < 2) return null;
  const unquote = (s: string) => s.trim().replace(/^"(.*)"$/, '$1');
  const header = rows[0];
  const series = header.slice(1).map((name) => ({ name: unquote(name), values: [] as number[] }));
  const labels: string[] = [];
  for (const row of rows.slice(1)) {
    labels.push(unquote(row[0] ?? ''));
    series.forEach((s, i) => {
      const v = parseFloat(unquote(row[i + 1] ?? '').replace(/[,\s]/g, ''));
      s.values.push(Number.isFinite(v) ? v : 0);
    });
  }
  return { labels, series };
}
