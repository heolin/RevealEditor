import { describe, it, expect } from 'vitest';
import { relativeHref } from './client';

describe('relativeHref (deck → workspace-relative target)', () => {
  it('deck at workspace root', () => {
    expect(relativeHref('talk.html', 'design/acme/system.css')).toBe('design/acme/system.css');
  });

  it('deck in a subfolder climbs up', () => {
    expect(relativeHref('talks/2026/q3.html', 'design/acme/system.css')).toBe(
      '../../design/acme/system.css',
    );
  });

  it('deck next to the design system', () => {
    expect(relativeHref('design/acme/demo.html', 'design/acme/system.css')).toBe('system.css');
  });

  it('shared parent folder', () => {
    expect(relativeHref('decks/talk.html', 'decks/shared/style.css')).toBe('shared/style.css');
  });
});
