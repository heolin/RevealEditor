/**
 * The round-trip fidelity core.
 *
 * Parses a reveal.js deck HTML file with parse5 (source locations enabled),
 * locates the byte ranges the editor is allowed to touch, and splices new
 * content into the ORIGINAL file text. Everything outside those ranges —
 * head content, comments, user scripts, Reveal.initialize config — is never
 * re-serialized and survives byte-for-byte.
 */
import { parse } from 'parse5';
import type { DefaultTreeAdapterTypes as T } from 'parse5';

export interface Region {
  start: number;
  end: number;
}

export interface SectionInfo {
  /** Exact source slice of the <section>…</section>, no surrounding whitespace. */
  source: string;
  /**
   * Source text between the previous sibling section (or the region start)
   * and this section: whitespace and any comments. Carried through the client
   * model so comments travel with their slide and no-op saves stay
   * byte-identical.
   */
  leading: string;
  /** Raw attribute text between `<section` and `>`, exactly as written. */
  attrsText: string;
  /** Inner source of the section. */
  inner: string;
  /** Present when this top-level section is a vertical stack. */
  children?: SectionInfo[];
  /** Stacks only: text between the last child section and `</section>`. */
  innerTrailing?: string;
}

export interface DeckInfo {
  title: string;
  titleRange: Region | null;
  /** Built-in theme name if the theme <link> matches `theme/<name>.css`, else null. */
  theme: string | null;
  themeHref: string | null;
  themeHrefValueRange: Region | null;
  /** Inner HTML region of <div class="slides">. */
  slidesRange: Region;
  /** Text between the last top-level section and </div> of .slides. */
  slidesTrailing: string;
  /** Indentation of top-level sections — used for newly created slides. */
  sectionIndent: string;
  /** Offset just before </head> — insertion point for new head content. */
  headInsertOffset: number | null;
  /** All stylesheet link hrefs, in order. */
  stylesheets: string[];
  /**
   * Contents of the deck's own <style> blocks outside the slides region
   * (excluding the editor-managed block). Custom-styled decks carry their
   * whole design here — the canvas and preview must load these.
   */
  headStyles: string[];
  managedCss: string;
  managedCssRange: Region | null;
  config: { width: number; height: number; center: boolean; margin: number; slideNumber: boolean };
  sections: SectionInfo[];
}

export interface DeckUpdate {
  slidesHtml?: string;
  theme?: string;
  title?: string;
  managedCss?: string;
  /** Stylesheet hrefs (relative to the deck file) to link before </head>. */
  addStylesheetLinks?: string[];
  /**
   * Write width/height into Reveal.initialize({...}) — the one surgical
   * config write (docs/ARCHITECTURE.md §3): existing numbers are replaced
   * in place, missing keys are inserted after the opening brace.
   */
  configPatch?: { width?: number; height?: number; slideNumber?: boolean };
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

function hasClass(el: Element, cls: string): boolean {
  const c = attr(el, 'class');
  return !!c && c.split(/\s+/).includes(cls);
}

/** Byte range of an attribute's VALUE (inside the quotes), or null if absent. */
function attrValueRange(src: string, el: Element, name: string): Region | null {
  const attrLoc = el.sourceCodeLocation?.attrs?.[name];
  if (!attrLoc) return null;
  const attrText = src.slice(attrLoc.startOffset, attrLoc.endOffset);
  const eq = attrText.indexOf('=');
  if (eq < 0) return null; // bare attribute, no value
  let vStart = attrLoc.startOffset + eq + 1;
  let vEnd = attrLoc.endOffset;
  const quote = src[vStart];
  if (quote === '"' || quote === "'") {
    vStart += 1;
    vEnd -= 1;
  }
  return { start: vStart, end: vEnd };
}

function* walk(node: Node): Generator<Element> {
  if (isElement(node)) yield node;
  const children: Node[] =
    'childNodes' in node ? (node as T.ParentNode).childNodes : [];
  for (const child of children) {
    if (isElement(child) && child.tagName === 'template') {
      yield* walk((child as T.Template).content);
    } else {
      yield* walk(child);
    }
  }
}

function innerRegion(el: Element): Region {
  const loc = el.sourceCodeLocation!;
  const start = loc.startTag ? loc.startTag.endOffset : loc.startOffset;
  const end = loc.endTag ? loc.endTag.startOffset : loc.endOffset;
  return { start, end };
}

function sectionInfo(
  src: string,
  el: Element,
  depth: number,
  leading: string,
): SectionInfo {
  const loc = el.sourceCodeLocation!;
  const source = src.slice(loc.startOffset, loc.endOffset);
  const startTag = loc.startTag!;
  // between "<section" and the closing ">" of the start tag
  const attrsText = src.slice(
    loc.startOffset + '<section'.length,
    startTag.endOffset - 1,
  );
  const innerEnd = loc.endTag ? loc.endTag.startOffset : loc.endOffset;
  const inner = src.slice(startTag.endOffset, innerEnd);
  const childSections = el.childNodes.filter(
    (n): n is Element => isElement(n) && n.tagName === 'section',
  );
  const info: SectionInfo = { source, leading, attrsText, inner };
  if (depth === 0 && childSections.length > 0) {
    info.children = withLeading(src, childSections, startTag.endOffset).map(
      ({ el, leading }) => sectionInfo(src, el, 1, leading),
    );
    const lastChildEnd = childSections[childSections.length - 1].sourceCodeLocation!.endOffset;
    info.innerTrailing = src.slice(lastChildEnd, innerEnd);
  }
  return info;
}

/** Pair each section element with the source text between it and its predecessor. */
function withLeading(
  src: string,
  sections: Element[],
  regionStart: number,
): { el: Element; leading: string }[] {
  let prevEnd = regionStart;
  return sections.map((el) => {
    const loc = el.sourceCodeLocation!;
    const leading = src.slice(prevEnd, loc.startOffset);
    prevEnd = loc.endOffset;
    return { el, leading };
  });
}

/** Whitespace indentation of the line the offset sits on (or '' if the line has content). */
function lineIndent(src: string, offset: number): string {
  const lineStart = src.lastIndexOf('\n', offset - 1) + 1;
  const prefix = src.slice(lineStart, offset);
  return /^\s*$/.test(prefix) ? prefix : '';
}

const THEME_HREF_RE = /(?:^|\/)theme\/([\w-]+)\.css(?:[?#].*)?$/;

export function parseDeck(src: string): DeckInfo {
  const doc = parse(src, { sourceCodeLocationInfo: true });

  let slidesEl: Element | null = null;
  let titleEl: Element | null = null;
  let themeLink: Element | null = null;
  let headEl: Element | null = null;
  let managedStyle: Element | null = null;
  const stylesheets: string[] = [];
  const styleEls: Element[] = [];

  for (const el of walk(doc)) {
    if (el.tagName === 'div' && hasClass(el, 'slides') && !slidesEl) {
      slidesEl = el;
    } else if (el.tagName === 'title' && !titleEl) {
      titleEl = el;
    } else if (el.tagName === 'head') {
      headEl = el;
    } else if (el.tagName === 'style') {
      if (attr(el, 'data-revealeditor') !== null && !managedStyle) {
        managedStyle = el;
      } else {
        styleEls.push(el);
      }
    } else if (el.tagName === 'link' && attr(el, 'rel') === 'stylesheet') {
      const href = attr(el, 'href');
      if (href) {
        stylesheets.push(href);
        if (!themeLink && THEME_HREF_RE.test(href)) themeLink = el;
      }
    }
  }

  if (!slidesEl || !slidesEl.sourceCodeLocation?.startTag) {
    throw new DeckParseError('No <div class="slides"> found — not a reveal.js deck');
  }

  const slidesRange = innerRegion(slidesEl);

  const sectionEls = slidesEl.childNodes.filter(
    (n): n is Element => isElement(n) && n.tagName === 'section',
  );
  const sections = withLeading(src, sectionEls, slidesRange.start).map(
    ({ el, leading }) => sectionInfo(src, el, 0, leading),
  );
  const slidesTrailing =
    sectionEls.length > 0
      ? src.slice(
          sectionEls[sectionEls.length - 1].sourceCodeLocation!.endOffset,
          slidesRange.end,
        )
      : src.slice(slidesRange.start, slidesRange.end);
  const sectionIndent =
    sectionEls.length > 0
      ? lineIndent(src, sectionEls[0].sourceCodeLocation!.startOffset) || '    '
      : '    ';

  // Theme link: href attribute VALUE range (inside the quotes).
  let themeHref: string | null = null;
  let theme: string | null = null;
  let themeHrefValueRange: Region | null = null;
  if (themeLink) {
    themeHref = attr(themeLink, 'href');
    theme = themeHref!.match(THEME_HREF_RE)![1];
    themeHrefValueRange = attrValueRange(src, themeLink, 'href');
  }

  const titleRange = titleEl ? innerRegion(titleEl) : null;
  const title = titleRange ? src.slice(titleRange.start, titleRange.end).trim() : '';

  const headInsertOffset =
    headEl?.sourceCodeLocation?.endTag?.startOffset ?? null;

  const managedCssRange = managedStyle ? innerRegion(managedStyle) : null;
  const managedCss = managedCssRange
    ? src.slice(managedCssRange.start, managedCssRange.end)
    : '';

  // User style blocks outside the slides region, in document order. Styles
  // inside slide content belong to the slides and travel with them instead.
  const headStyles = styleEls
    .filter((el) => {
      const loc = el.sourceCodeLocation!;
      return loc.endOffset <= slidesRange.start || loc.startOffset >= slidesRange.end;
    })
    .map((el) => {
      const inner = innerRegion(el);
      return src.slice(inner.start, inner.end);
    });

  // Best-effort read of layout-relevant options from Reveal.initialize({...}).
  // The config script is opaque to the editor and is never rewritten.
  const config = { width: 960, height: 700, center: true, margin: 0.04, slideNumber: false };
  const initMatch = src.match(/Reveal\.initialize\s*\(\s*\{([\s\S]*?)\}\s*\)/);
  if (initMatch) {
    const w = initMatch[1].match(/\bwidth\s*:\s*(\d+)/);
    const h = initMatch[1].match(/\bheight\s*:\s*(\d+)/);
    const c = initMatch[1].match(/\bcenter\s*:\s*(true|false)/);
    const m = initMatch[1].match(/\bmargin\s*:\s*([\d.]+)/);
    if (w) config.width = parseInt(w[1], 10);
    if (h) config.height = parseInt(h[1], 10);
    if (c) config.center = c[1] === 'true';
    if (m) config.margin = parseFloat(m[1]);
    const sn = initMatch[1].match(/\bslideNumber\s*:\s*(true|false)/);
    if (sn) config.slideNumber = sn[1] === 'true';
  }

  return {
    title,
    titleRange,
    theme,
    themeHref,
    themeHrefValueRange,
    slidesRange,
    slidesTrailing,
    sectionIndent,
    headInsertOffset,
    stylesheets,
    headStyles,
    managedCss,
    managedCssRange,
    config,
    sections,
  };
}

export class DeckParseError extends Error {}

export type ResourceKind = 'link' | 'script';

export interface ResourceRef {
  kind: ResourceKind;
  /** The href/src value as written. */
  url: string;
  /** Byte range of the value inside the quotes — the splice target. */
  valueRange: Region;
}

/**
 * Every vendorable external resource the deck loads: `<link rel="stylesheet">`
 * hrefs and `<script src>` values, paired with the byte range of the value so
 * the "bundle offline" flow can rewrite each in place. Order is document order.
 */
export function resourceRefs(src: string): ResourceRef[] {
  const doc = parse(src, { sourceCodeLocationInfo: true });
  const refs: ResourceRef[] = [];
  for (const el of walk(doc)) {
    let name: string;
    let kind: ResourceKind;
    if (el.tagName === 'link') {
      if (attr(el, 'rel') !== 'stylesheet') continue;
      name = 'href';
      kind = 'link';
    } else if (el.tagName === 'script') {
      name = 'src';
      kind = 'script';
    } else {
      continue;
    }
    const url = attr(el, name);
    if (!url) continue;
    const valueRange = attrValueRange(src, el, name);
    if (!valueRange) continue;
    refs.push({ kind, url, valueRange });
  }
  return refs;
}

/** Splice new hrefs into resource-ref value ranges (byte-surgical, like the theme swap). */
export function rewriteResourceRefs(
  src: string,
  rewrites: { range: Region; href: string }[],
): string {
  return applyEdits(
    src,
    rewrites.map((r) => ({ start: r.range.start, end: r.range.end, text: escapeAttr(r.href) })),
  );
}

interface Edit {
  start: number;
  end: number;
  text: string;
}

function applyEdits(src: string, edits: Edit[]): string {
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let out = src;
  for (const e of sorted) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  }
  return out;
}

const MANAGED_STYLE_OPEN = '<style data-revealeditor="managed">';

/** Splice updates into the original deck source. Unspecified fields are untouched. */
export function updateDeck(src: string, update: DeckUpdate): string {
  const info = parseDeck(src);
  const edits: Edit[] = [];

  if (update.slidesHtml !== undefined) {
    edits.push({ ...info.slidesRange, text: update.slidesHtml });
  }

  if (update.theme !== undefined) {
    if (!info.themeHrefValueRange || !info.themeHref) {
      throw new DeckParseError('Deck has no recognizable theme <link> to update');
    }
    const newHref = info.themeHref.replace(
      /((?:^|\/)theme\/)[\w-]+(\.css)/,
      `$1${update.theme}$2`,
    );
    edits.push({ ...info.themeHrefValueRange, text: newHref });
  }

  if (update.title !== undefined && info.titleRange) {
    edits.push({ ...info.titleRange, text: escapeHtmlText(update.title) });
  }

  if (update.addStylesheetLinks && update.addStylesheetLinks.length > 0) {
    if (info.headInsertOffset === null) {
      throw new DeckParseError('Deck has no <head> to insert stylesheet links into');
    }
    const links = update.addStylesheetLinks
      .filter((href) => !info.stylesheets.includes(href))
      .map((href) => `<link rel="stylesheet" href="${escapeAttr(href)}">\n`)
      .join('');
    if (links) {
      edits.push({ start: info.headInsertOffset, end: info.headInsertOffset, text: links });
    }
  }

  if (
    update.configPatch &&
    (update.configPatch.width ||
      update.configPatch.height ||
      update.configPatch.slideNumber !== undefined)
  ) {
    const init = /Reveal\.initialize\s*\(\s*\{([\s\S]*?)\}\s*\)/.exec(src);
    if (!init) {
      throw new DeckParseError('Deck has no Reveal.initialize({...}) to write config into');
    }
    const innerStart = init.index + init[0].indexOf('{') + 1;
    const inner = init[1];
    const missing: string[] = [];
    for (const key of ['width', 'height'] as const) {
      const value = update.configPatch[key];
      if (!value) continue;
      const m = new RegExp(`\\b${key}\\s*:\\s*(\\d+)`).exec(inner);
      if (m) {
        const numStart = innerStart + m.index + m[0].length - m[1].length;
        edits.push({ start: numStart, end: numStart + m[1].length, text: String(value) });
      } else {
        missing.push(`${key}: ${value}`);
      }
    }
    if (update.configPatch.slideNumber !== undefined) {
      const value = String(update.configPatch.slideNumber);
      const m = /\bslideNumber\s*:\s*(true|false)/.exec(inner);
      if (m) {
        const valStart = innerStart + m.index + m[0].length - m[1].length;
        edits.push({ start: valStart, end: valStart + m[1].length, text: value });
      } else {
        missing.push(`slideNumber: ${value}`);
      }
    }
    if (missing.length > 0) {
      edits.push({ start: innerStart, end: innerStart, text: ` ${missing.join(', ')},` });
    }
  }

  if (update.managedCss !== undefined) {
    if (info.managedCssRange) {
      edits.push({ ...info.managedCssRange, text: update.managedCss });
    } else if (update.managedCss.trim() !== '') {
      if (info.headInsertOffset === null) {
        throw new DeckParseError('Deck has no <head> to insert managed styles into');
      }
      edits.push({
        start: info.headInsertOffset,
        end: info.headInsertOffset,
        text: `${MANAGED_STYLE_OPEN}\n${update.managedCss}\n</style>\n`,
      });
    }
  }

  return applyEdits(src, edits);
}

function escapeHtmlText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
