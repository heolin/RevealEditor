/**
 * Server config — a small JSON file in the project directory (NOT the user's
 * home), holding the active workspace and whether the workspace can be changed
 * from the UI. Locking workspace changes matters when the app is hosted:
 * switching folders exposes the rest of the machine's filesystem, so it is
 * OFF by default and must be opted into (config flag or --allow-workspace-change).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ServerConfig {
  /** Active workspace directory (absolute, or relative to the config file). */
  workspace?: string;
  /** Allow changing the workspace from the UI. Default false (safe for hosting). */
  allowWorkspaceChange?: boolean;
}

/** Default config location: <repo-root>/revealeditor.config.json. This file
 *  sits at server/{src,dist}/lib/config.*, so the repo root is three levels up —
 *  the same in tsx dev (src/lib) and the built server (dist/lib). */
export function defaultConfigPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '../../..', 'revealeditor.config.json');
}

export function loadConfig(configPath: string): ServerConfig {
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object') return parsed as ServerConfig;
  } catch {
    /* missing or unreadable → defaults */
  }
  return {};
}

/** Merge a patch into the on-disk config (creating the file if needed). */
export function saveConfig(configPath: string, patch: Partial<ServerConfig>): void {
  const merged = { ...loadConfig(configPath), ...patch };
  fs.writeFileSync(configPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
}
