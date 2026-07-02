import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Workspace } from './workspace.js';
import { listDesignSystems } from './designSystem.js';
import { parseDeck, updateDeck } from './deckFile.js';
import fs from 'node:fs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEMO_WS = path.join(HERE, '../../../demo-workspace');

describe('design systems', () => {
  it('finds the demo system with components and stylesheets', async () => {
    const systems = await listDesignSystems(new Workspace(DEMO_WS));
    expect(systems).toHaveLength(1);
    const acme = systems[0];
    expect(acme.dir).toBe('design/acme');
    expect(acme.name).toBe('ACME design system');
    expect(acme.stylesheets).toEqual(['design/acme/system.css']);
    expect(acme.components.map((c) => c.id)).toEqual([
      'callout', 'kpi', 'quote', 'section-title',
    ]);
    const callout = acme.components[0];
    expect(callout.name).toBe('Callout box');
    expect(callout.description).toContain('accent bar');
    expect(callout.html).toContain('acme-callout');
  });

  it('components.html itself is not detected as a deck', async () => {
    const decks = await new Workspace(DEMO_WS).listDecks();
    expect(decks.some((d) => d.path.includes('components.html'))).toBe(false);
  });
});

describe('addStylesheetLinks splice', () => {
  const src = fs.readFileSync(
    path.join(HERE, '../../test/fixtures/demo.html'),
    'utf8',
  );

  it('inserts links before </head>, byte-preserving everything else', () => {
    const updated = updateDeck(src, { addStylesheetLinks: ['../design/acme/system.css'] });
    expect(updated).toContain('<link rel="stylesheet" href="../design/acme/system.css">\n</head>');
    const info = parseDeck(updated);
    expect(info.stylesheets).toContain('../design/acme/system.css');
    // Removing the inserted line restores the original bytes.
    expect(updated.replace('<link rel="stylesheet" href="../design/acme/system.css">\n', '')).toBe(src);
  });

  it('skips hrefs already linked (idempotent)', () => {
    const once = updateDeck(src, { addStylesheetLinks: ['x.css'] });
    const twice = updateDeck(once, { addStylesheetLinks: ['x.css'] });
    expect(twice).toBe(once);
  });
});
