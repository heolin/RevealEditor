import { describe, it, expect } from 'vitest';
import type { EditorContext } from './types';
import type { StageCtx } from '../commands';
import { getAction, resolveLayout, allActions } from './index';
import { applyLayoutOverrides, getLayout, resetLayouts, type SurfaceId } from './layouts';
import { handlerFor } from '../registry';
import { fontOptions } from './fonts';
import type { DeckMeta } from '../../state/deckStore';

function fakeCtx(overrides: Partial<EditorContext> = {}): EditorContext {
  const section = document.createElement('section');
  const stage: StageCtx = { doc: document, section, slideId: 's1', markClean: () => undefined };
  return {
    stage,
    selection: null,
    handler: null,
    session: null,
    isAbsolute: false,
    cell: null,
    slide: { id: 's1', attrsText: '', source: '<section></section>', leading: '\n' },
    deck: null,
    ...overrides,
  };
}

function selected(tag: string, absolute = false): EditorContext {
  const el = document.createElement(tag);
  if (absolute) el.style.position = 'absolute';
  return fakeCtx({ selection: el, handler: handlerFor(el), isAbsolute: absolute });
}

describe('action availability', () => {
  it('layouts reference only known actions', () => {
    for (const surface of ['top', 'floating', 'insertMenu', 'context'] as SurfaceId[]) {
      for (const id of getLayout(surface).flat()) {
        expect(getAction(id), id).not.toBeNull();
      }
    }
  });

  it('every action id is unique', () => {
    const ids = allActions().map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('inline formatting only during a text session', () => {
    const bold = getAction('format.bold')!;
    expect(bold.when(fakeCtx())).toBe(false);
    expect(bold.when(fakeCtx({ session: 'text' }))).toBe(true);
  });

  it('font/align actions apply to text-ish selections, not images', () => {
    const font = getAction('format.fontFamily')!;
    expect(font.when(selected('h2'))).toBe(true);
    expect(font.when(selected('table'))).toBe(true);
    expect(font.when(selected('img'))).toBe(false);
    expect(font.when(fakeCtx())).toBe(false);
  });

  it('arrange z-order/unpin only for absolutely positioned elements', () => {
    const front = getAction('arrange.front')!;
    expect(front.when(selected('p'))).toBe(false);
    expect(front.when(selected('p', true))).toBe(true);
  });

  it('insert actions hidden during text sessions and without a slide', () => {
    const table = getAction('insert.table')!;
    expect(table.when(fakeCtx())).toBe(true);
    expect(table.when(fakeCtx({ session: 'text' }))).toBe(false);
    expect(table.when(fakeCtx({ slide: null }))).toBe(false);
  });

  it('resolveLayout drops unavailable actions and empty groups', () => {
    const groups = resolveLayout(getLayout('floating'), fakeCtx());
    // Nothing selected, no session → no floating toolbar content at all.
    expect(groups.flat().filter((a) => a.group === 'format')).toHaveLength(0);
  });

  it('table quick-ops appear only with a cell context', () => {
    const cellCtx = (() => {
      const table = document.createElement('table');
      table.innerHTML = '<tbody><tr><td>x</td></tr></tbody>';
      const td = table.querySelector('td')!;
      return fakeCtx({ selection: td, handler: handlerFor(td), cell: td });
    })();
    expect(getAction('table.rowBelow')!.when(cellCtx)).toBe(true);
    expect(getAction('table.rowBelow')!.when(selected('p'))).toBe(false);
    const menu = resolveLayout(getLayout('context'), cellCtx).flat();
    expect(menu.some((a) => a.id === 'table.deleteCol')).toBe(true);
  });

  it('layout overrides replace surfaces and reject invalid shapes', () => {
    applyLayoutOverrides({ toolbars: { floating: [['format.bold']], top: 'nonsense' } });
    expect(getLayout('floating')).toEqual([['format.bold']]);
    expect(getLayout('top').length).toBeGreaterThan(1); // untouched
    resetLayouts();
    expect(getLayout('floating').flat().length).toBeGreaterThan(1);
  });

  it('heading select exposes current tag and options', () => {
    const ctx = selected('h2');
    const heading = getAction('format.heading')!;
    expect(heading.when(ctx)).toBe(true);
    expect(heading.value?.(ctx)).toBe('H2');
    expect(heading.options?.(ctx)?.some((o) => o.value === 'P')).toBe(true);
  });
});

describe('fontOptions', () => {
  it('detects families from deck CSS and Google Fonts links', () => {
    const deck = {
      headStyles: ['.reveal{font-family:"Newsreader",Georgia,serif;} .k{font-family:\'JetBrains Mono\',monospace}'],
      stylesheets: [
        'https://fonts.googleapis.com/css2?family=Fraunces:ital@0;1&family=Newsreader&display=swap',
      ],
    } as unknown as DeckMeta;
    const labels = fontOptions(deck).map((o) => o.label);
    expect(labels).toContain('Theme default');
    expect(labels).toContain('Newsreader');
    expect(labels).toContain('JetBrains Mono');
    expect(labels).toContain('Fraunces');
    expect(labels).toContain('Monospace');
  });

  it('works without a deck', () => {
    expect(fontOptions(null)[0].label).toBe('Theme default');
  });
});
