import { describe, it, expect, beforeEach } from 'vitest';
import { useDeckStore } from './deckStore';
import type { DeckData } from '../api/client';

function fakeDeck(): DeckData {
  return {
    path: 'test.html',
    title: 'Test',
    theme: 'black',
    themeHref: 'theme/black.css',
    stylesheets: [],
    managedCss: '',
    config: { width: 960, height: 700 },
    sections: [
      { source: '<section><h1>One</h1></section>', leading: '\n  ', attrsText: '', inner: '<h1>One</h1>' },
      { source: '<section><h1>Two</h1></section>', leading: '\n  ', attrsText: '', inner: '<h1>Two</h1>' },
    ],
    slidesTrailing: '\n',
    sectionIndent: '  ',
    mtime: 1,
  };
}

describe('deck store undo history', () => {
  beforeEach(() => {
    useDeckStore.getState().close();
    useDeckStore.getState().load(fakeDeck());
  });

  it('loading a deck starts with an empty undo stack', () => {
    expect(useDeckStore.temporal.getState().pastStates).toHaveLength(0);
  });

  it('undo never goes past the loaded state', () => {
    const store = useDeckStore.getState();
    store.addSlideAfterColumn(store.columns[0].id);
    expect(useDeckStore.getState().columns).toHaveLength(3);

    const temporal = useDeckStore.temporal.getState();
    temporal.undo();
    expect(useDeckStore.getState().columns).toHaveLength(2);

    // Further undos are no-ops — the deck can never become pre-load empty.
    temporal.undo();
    temporal.undo();
    expect(useDeckStore.getState().columns).toHaveLength(2);
  });

  it('undo/redo round-trips an edit', () => {
    const store = useDeckStore.getState();
    const slideId = store.columns[0].slides[0].id;
    store.updateSlideSource(slideId, '<section><h1>Edited</h1></section>');
    useDeckStore.temporal.getState().undo();
    expect(useDeckStore.getState().columns[0].slides[0].source).toContain('One');
    useDeckStore.temporal.getState().redo();
    expect(useDeckStore.getState().columns[0].slides[0].source).toContain('Edited');
  });

  it('identical source commits do not create history entries', () => {
    const store = useDeckStore.getState();
    const slide = store.columns[0].slides[0];
    const before = useDeckStore.temporal.getState().pastStates.length;
    store.updateSlideSource(slide.id, slide.source);
    expect(useDeckStore.temporal.getState().pastStates).toHaveLength(before);
  });

  it('selection changes do not create history entries', () => {
    const store = useDeckStore.getState();
    const before = useDeckStore.temporal.getState().pastStates.length;
    store.select(store.columns[1].slides[0].id);
    expect(useDeckStore.temporal.getState().pastStates).toHaveLength(before);
  });
});
