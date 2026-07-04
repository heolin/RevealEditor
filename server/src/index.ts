#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from './app.js';
import { loadConfig, defaultConfigPath } from './lib/config.js';

const args = process.argv.slice(2);
let workspaceArg: string | null = null;
let defaultWorkspaceArg: string | null = null;
let port = 4321;
let configPath = defaultConfigPath();
let allowFlag = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port') {
    port = parseInt(args[++i], 10);
  } else if (args[i] === '--config') {
    configPath = path.resolve(args[++i]);
  } else if (args[i] === '--default-workspace') {
    // A fallback below config.workspace — used by `npm run dev` so the demo
    // folder is the default WITHOUT overriding a user's configured workspace.
    defaultWorkspaceArg = path.resolve(args[++i]);
  } else if (args[i] === '--allow-workspace-change') {
    allowFlag = true;
  } else if (!args[i].startsWith('-')) {
    workspaceArg = path.resolve(args[i]);
  }
}

const config = loadConfig(configPath);
const configWorkspace = config.workspace
  ? path.resolve(path.dirname(configPath), config.workspace)
  : null;
// Precedence: explicit CLI arg › config.workspace › --default-workspace › cwd.
const workspace = workspaceArg ?? configWorkspace ?? defaultWorkspaceArg ?? process.cwd();
// Enabled by the CLI flag OR the config; OFF by default (safe for hosting).
const allowWorkspaceChange = allowFlag || config.allowWorkspaceChange === true;

const configExists = fs.existsSync(configPath);
const workspaceSource = workspaceArg
  ? 'command-line argument'
  : configWorkspace
    ? 'config file'
    : defaultWorkspaceArg
      ? 'dev default'
      : 'current directory (no folder given)';
const switchSource = allowFlag
  ? '--allow-workspace-change flag'
  : config.allowWorkspaceChange === true
    ? 'config file'
    : 'default';

const app = createApp(workspace, { allowWorkspaceChange, configPath });
app.listen(port, () => {
  console.log('revealeditor');
  console.log(`  config:     ${configPath} ${configExists ? '(loaded)' : '(not found — using defaults)'}`);
  console.log(`  workspace:  ${workspace} (from ${workspaceSource})`);
  console.log(
    `  switching:  ${allowWorkspaceChange ? 'ENABLED' : 'disabled'} (${switchSource})`,
  );
  console.log(`  → http://localhost:${port}`);
  if (allowWorkspaceChange) {
    console.log(
      '  ⚠ switching lets the UI re-root to ANY directory on this machine — keep it off when hosting.',
    );
  }
});
