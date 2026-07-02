/**
 * Design systems: a workspace folder containing `components.html` — an inert
 * file where each reusable component is a
 *   <template data-component="callout" data-name="Callout box" data-description="…">…</template>
 * plus the system's stylesheets (the <link rel="stylesheet"> tags in that
 * file; fallback: every .css file in the folder).
 *
 * Components are plain HTML snippets — inserting one copies markup into the
 * slide with no runtime binding, so decks stay standalone and detachable.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'parse5';
import type { DefaultTreeAdapterTypes as T } from 'parse5';
import type { Workspace } from './workspace.js';

export interface DesignComponent {
  id: string;
  name: string;
  description?: string;
  html: string;
}

export interface DesignSystem {
  /** Workspace-relative folder, doubles as the id. */
  dir: string;
  name: string;
  /** Workspace-relative stylesheet paths. */
  stylesheets: string[];
  components: DesignComponent[];
}

type Element = T.Element;
type Node = T.Node;

function isElement(node: Node): node is Element {
  return 'tagName' in node;
}

function attr(el: Element, name: string): string | null {
  const a = el.attrs.find((a) => a.name === name);
  return a ? a.value : null;
}

function* walk(node: Node): Generator<Element> {
  if (isElement(node)) yield node;
  const children: Node[] =
    isElement(node) && node.tagName === 'template'
      ? (node as T.Template).content.childNodes
      : 'childNodes' in node
        ? (node as T.ParentNode).childNodes
        : [];
  for (const child of children) yield* walk(child);
}

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', '.cache', 'assets']);

export async function listDesignSystems(ws: Workspace): Promise<DesignSystem[]> {
  const systems: DesignSystem[] = [];
  await scanDir(ws, ws.root, systems);
  systems.sort((a, b) => a.dir.localeCompare(b.dir));
  return systems;
}

async function scanDir(ws: Workspace, dir: string, out: DesignSystem[]): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
        await scanDir(ws, abs, out);
      }
    } else if (entry.isFile() && entry.name === 'components.html') {
      const system = await parseSystem(ws, abs);
      if (system && system.components.length > 0) out.push(system);
    }
  }
}

async function parseSystem(ws: Workspace, absFile: string): Promise<DesignSystem | null> {
  let src: string;
  try {
    src = await fs.readFile(absFile, 'utf8');
  } catch {
    return null;
  }
  const doc = parse(src, { sourceCodeLocationInfo: true });
  const absDir = path.dirname(absFile);
  const relDir = ws.relative(absDir);

  const components: DesignComponent[] = [];
  const stylesheets: string[] = [];
  let title: string | null = null;

  for (const el of walk(doc)) {
    if (el.tagName === 'template') {
      const id = attr(el, 'data-component');
      if (!id) continue;
      const loc = el.sourceCodeLocation;
      if (!loc?.startTag || !loc.endTag) continue;
      const html = src.slice(loc.startTag.endOffset, loc.endTag.startOffset).trim();
      if (!html) continue;
      components.push({
        id,
        name: attr(el, 'data-name') ?? id,
        description: attr(el, 'data-description') ?? undefined,
        html,
      });
    } else if (el.tagName === 'link' && attr(el, 'rel') === 'stylesheet') {
      const href = attr(el, 'href');
      if (href && !/^(https?:)?\/\//.test(href)) {
        stylesheets.push(path.posix.join(relDir, href));
      }
    } else if (el.tagName === 'title' && !title) {
      const text = el.childNodes.find((n) => n.nodeName === '#text') as T.TextNode | undefined;
      title = text?.value.trim() || null;
    }
  }

  // No explicit links → every .css sitting in the folder is the system.
  if (stylesheets.length === 0) {
    try {
      const files = await fs.readdir(absDir);
      for (const f of files.filter((f) => f.endsWith('.css')).sort()) {
        stylesheets.push(path.posix.join(relDir, f));
      }
    } catch {
      /* folder just went away — treat as no stylesheets */
    }
  }

  return {
    dir: relDir,
    name: title ?? path.basename(absDir),
    stylesheets,
    components,
  };
}
