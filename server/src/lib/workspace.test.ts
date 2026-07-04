import { describe, it, expect } from 'vitest';
import { Workspace, PathError } from './workspace.js';

describe('Workspace.setRoot', () => {
  it('re-roots and confines resolution to the new root', () => {
    const ws = new Workspace('/tmp/a');
    expect(ws.root).toBe('/tmp/a');

    ws.setRoot('/tmp/b');
    expect(ws.root).toBe('/tmp/b');
    expect(ws.resolve('deck.html')).toBe('/tmp/b/deck.html');
    // The old root is no longer reachable, and traversal still can't escape.
    expect(() => ws.resolve('../a/deck.html')).toThrow(PathError);
  });
});
