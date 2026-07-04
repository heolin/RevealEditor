#!/usr/bin/env node
import path from 'node:path';
import { createApp } from './app.js';
import { loadConfig, defaultConfigPath } from './lib/config.js';

const args = process.argv.slice(2);
let workspaceArg: string | null = null;
let port = 4321;
let configPath = defaultConfigPath();
let allowFlag = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port') {
    port = parseInt(args[++i], 10);
  } else if (args[i] === '--config') {
    configPath = path.resolve(args[++i]);
  } else if (args[i] === '--allow-workspace-change') {
    allowFlag = true;
  } else if (!args[i].startsWith('-')) {
    workspaceArg = path.resolve(args[i]);
  }
}

const config = loadConfig(configPath);
// Precedence: explicit CLI arg › persisted config.workspace › cwd.
const workspace =
  workspaceArg ??
  (config.workspace ? path.resolve(path.dirname(configPath), config.workspace) : process.cwd());
// Enabled by the CLI flag OR the config; OFF by default (safe for hosting).
const allowWorkspaceChange = allowFlag || config.allowWorkspaceChange === true;

const app = createApp(workspace, { allowWorkspaceChange, configPath });
app.listen(port, () => {
  console.log(`revealeditor serving workspace ${workspace}`);
  console.log(`  http://localhost:${port}`);
  if (allowWorkspaceChange) {
    console.log(
      '  ⚠ workspace switching is ENABLED — the UI can re-root to any directory on this machine.',
    );
    console.log('    Do not expose this server to untrusted networks with switching on.');
  }
});
