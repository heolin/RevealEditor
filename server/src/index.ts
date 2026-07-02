#!/usr/bin/env node
import path from 'node:path';
import { createApp } from './app.js';

const args = process.argv.slice(2);
let workspace = process.cwd();
let port = 4321;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port') {
    port = parseInt(args[++i], 10);
  } else if (!args[i].startsWith('-')) {
    workspace = path.resolve(args[i]);
  }
}

const app = createApp(workspace);
app.listen(port, () => {
  console.log(`revealeditor serving workspace ${workspace}`);
  console.log(`  http://localhost:${port}`);
});
