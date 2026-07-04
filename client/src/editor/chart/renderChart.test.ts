import { describe, it, expect } from 'vitest';
import { type ChartSpec, renderChart, CHART_PALETTE_LIGHT } from './renderChart';
import { parseDelimited } from './chart';
import { defaultShapeSpec, renderShapeInto } from '../shapes';

const SPEC: ChartSpec = {
  type: 'bar',
  labels: ['Q1', 'Q2', 'Q3'],
  series: [
    { name: 'North', values: [10, 20, 15] },
    { name: 'South', values: [5, 12, 18] },
  ],
  options: { title: 'Revenue', valueLabels: true },
};

describe('renderChart', () => {
  it('is deterministic: same spec + size + mode → identical SVG', () => {
    const a = renderChart(SPEC, 640, 400, 'dark');
    const b = renderChart(JSON.parse(JSON.stringify(SPEC)), 640, 400, 'dark');
    expect(a).toBe(b);
  });

  it('contains no ids, scripts, or randomness hooks', () => {
    for (const type of ['bar', 'stackedBar', 'line', 'area', 'pie', 'donut', 'scatter'] as const) {
      const svg = renderChart({ ...SPEC, type, labels: ['1', '2', '3'] }, 640, 400, 'light');
      expect(svg).not.toMatch(/\bid=/);
      expect(svg).not.toContain('<script');
      expect(svg.startsWith('<svg xmlns=')).toBe(true);
      expect(svg.endsWith('</svg>')).toBe(true);
    }
  });

  it('uses fixed palette slot order, never cycled by filtering', () => {
    const svg = renderChart(SPEC, 640, 400, 'light');
    expect(svg).toContain(CHART_PALETTE_LIGHT[0]);
    expect(svg).toContain(CHART_PALETTE_LIGHT[1]);
  });

  it('renders a legend for ≥2 series and none for a single series', () => {
    const two = renderChart(SPEC, 640, 400, 'light');
    expect(two).toContain('North');
    expect(two).toContain('South');
    const one = renderChart(
      { ...SPEC, series: [SPEC.series[0]], options: {} },
      640, 400, 'light',
    );
    // Single series: no legend swatch row (rect with rx=2 legend marker)
    expect(one).not.toContain('North');
  });

  it('escapes HTML-sensitive text in titles and labels', () => {
    const svg = renderChart(
      { ...SPEC, labels: ['<b>&x'], series: [{ name: 'A&B', values: [1] }, { name: 'C', values: [2] }], options: { title: '<script>' } },
      640, 400, 'light',
    );
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).toContain('A&amp;B');
    expect(svg).not.toContain('<script>');
  });

  it('pie slices sum the full circle and label big slices only when enabled', () => {
    const svg = renderChart(
      { type: 'pie', labels: ['A', 'B', 'C'], series: [{ name: 'v', values: [50, 30, 20] }], options: { valueLabels: true } },
      400, 300, 'dark',
    );
    expect(svg).toContain('50%');
    expect((svg.match(/<path/g) ?? []).length).toBe(3);
  });
});

describe('parseDelimited', () => {
  it('parses TSV with header row and label column', () => {
    const parsed = parseDelimited('Label\tNorth\tSouth\nQ1\t10\t5\nQ2\t20\t12');
    expect(parsed).toEqual({
      labels: ['Q1', 'Q2'],
      series: [
        { name: 'North', values: [10, 20] },
        { name: 'South', values: [5, 12] },
      ],
    });
  });

  it('parses CSV and tolerates junk numbers', () => {
    const parsed = parseDelimited('L,A\nx,"1"\ny,oops');
    expect(parsed?.series[0].values).toEqual([1, 0]);
  });

  it('rejects too-small input', () => {
    expect(parseDelimited('just one line')).toBeNull();
  });
});

describe('shapes', () => {
  function shapeEl(kind: Parameters<typeof defaultShapeSpec>[0]): HTMLElement {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as unknown as HTMLElement;
    el.setAttribute('data-re-shape', JSON.stringify(defaultShapeSpec(kind)));
    el.style.width = '200px';
    el.style.height = '100px';
    return el;
  }

  it('renders each kind deterministically at the element size', () => {
    for (const kind of ['rect', 'ellipse', 'line', 'arrow'] as const) {
      const el = shapeEl(kind);
      renderShapeInto(el);
      const first = el.innerHTML;
      expect(el.getAttribute('viewBox')).toBe('0 0 200 100');
      expect(first.length).toBeGreaterThan(10);
      renderShapeInto(el);
      expect(el.innerHTML).toBe(first);
    }
  });

  it('arrow uses no <marker> (no document-unique ids to collide)', () => {
    const el = shapeEl('arrow');
    renderShapeInto(el);
    expect(el.innerHTML).not.toContain('marker');
    expect(el.innerHTML).toContain('<path');
  });
});

describe('horizontal bar / combo / number formats', () => {
  const base: ChartSpec = {
    type: 'hbar',
    labels: ['Alpha', 'Beta', 'Gamma'],
    series: [
      { name: 'A', values: [10, 25, 15] },
      { name: 'B', values: [8, 12, 20] },
    ],
    options: {},
  };

  it('hbar renders deterministic horizontal bars with left category labels', () => {
    const svg = renderChart(base, 640, 400, 'light');
    expect(svg).toBe(renderChart(base, 640, 400, 'light')); // deterministic
    expect(svg).toContain('Alpha');
    // 6 bars = 2 series × 3 categories, drawn as paths after the gridlines.
    expect(svg.match(/<path /g)!.length).toBe(6);
    // Vertical gridlines: x1 === x2.
    expect(svg).toMatch(/<line x1="([\d.]+)" y1="[\d.]+" x2="\1"/);
  });

  it('combo draws bars for bar series and a line for line series', () => {
    const combo: ChartSpec = {
      ...base,
      type: 'combo',
      series: [
        { name: 'Revenue', values: [10, 25, 15] },
        { name: 'Trend', values: [12, 18, 22], kind: 'line' },
      ],
    };
    const svg = renderChart(combo, 640, 400, 'light');
    expect(svg.match(/<path d="M[\d.]+,[\d.]+ L[\d.]+,[\d.]+ Q/g)!.length).toBe(3); // 3 bars
    expect(svg).toContain('stroke-width="2" stroke-linejoin="round"'); // the line
    expect(svg).toContain('<circle'); // line endpoint marker
  });

  it('number formats apply to ticks and value labels', () => {
    const pct = renderChart(
      { ...base, options: { valueLabels: true, format: 'percent' } },
      640,
      400,
      'light',
    );
    expect(pct).toContain('25%');
    const compact: ChartSpec = {
      ...base,
      type: 'bar',
      series: [{ name: 'A', values: [1200, 2500, 1800] }],
      options: { valueLabels: true, format: 'compact' },
    };
    expect(renderChart(compact, 640, 400, 'light')).toContain('2.5K');
    // 'auto' output unchanged (legacy byte-compat).
    const auto = renderChart({ ...base, type: 'bar', options: {} }, 640, 400, 'light');
    expect(auto).toContain('>25<');
  });
});
