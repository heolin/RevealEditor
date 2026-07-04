import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, saveConfig } from './config.js';

function tmpConfig(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 're-cfg-')), 'revealeditor.config.json');
}

describe('server config', () => {
  it('returns {} when the file is missing', () => {
    expect(loadConfig(path.join(os.tmpdir(), 'nope-does-not-exist-9421.json'))).toEqual({});
  });

  it('round-trips a saved config', () => {
    const p = tmpConfig();
    saveConfig(p, { workspace: '/tmp/talks', allowWorkspaceChange: true });
    expect(loadConfig(p)).toEqual({ workspace: '/tmp/talks', allowWorkspaceChange: true });
  });

  it('merges patches, preserving existing keys', () => {
    const p = tmpConfig();
    saveConfig(p, { allowWorkspaceChange: true });
    saveConfig(p, { workspace: '/tmp/other' });
    expect(loadConfig(p)).toEqual({ allowWorkspaceChange: true, workspace: '/tmp/other' });
  });

  it('tolerates malformed JSON', () => {
    const p = tmpConfig();
    fs.writeFileSync(p, '{ not valid json');
    expect(loadConfig(p)).toEqual({});
  });
});
