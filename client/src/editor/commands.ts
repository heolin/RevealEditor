/**
 * The single mutation funnel. Every change to slide content goes through a
 * command here: mutate the live stage DOM, then commit (serialize → store,
 * which snapshots history and marks the deck dirty). Nothing else in the
 * codebase mutates slide DOM.
 */
import { serializeSlide } from './serializeSlide';
import { hydrateCodeBlocks } from './codeHighlight';
import { useDeckStore } from '../state/deckStore';
import { useEditorStore } from './editorStore';

export interface StageCtx {
  doc: Document;
  /** The stage <section> hosting the current slide. */
  section: HTMLElement;
  slideId: string;
  /** Lets the stage recognize its own commits and skip the DOM rebuild. */
  markClean(source: string): void;
}

export function commit(ctx: StageCtx): void {
  // Newly inserted/pasted code blocks get raw-text recording + display
  // highlighting before serialization restores raw text into the clone.
  hydrateCodeBlocks(ctx.section);
  const source = serializeSlide(ctx.section);
  ctx.markClean(source);
  useDeckStore.getState().updateSlideSource(ctx.slideId, source);
  useEditorStore.getState().bump();
}

/* ---------- inline formatting (within a text session) ---------- */

export function execInline(ctx: StageCtx, command: 'bold' | 'italic' | 'strikeThrough'): void {
  ctx.doc.execCommand(command);
}

export function insertList(ctx: StageCtx, ordered: boolean): void {
  ctx.doc.execCommand(ordered ? 'insertOrderedList' : 'insertUnorderedList');
}

export function setLink(ctx: StageCtx, href: string): void {
  const existing = linkAtSelection(ctx);
  if (existing) {
    // Editing an existing link preserves all its other attributes.
    existing.setAttribute('href', href);
  } else {
    ctx.doc.execCommand('createLink', false, href);
  }
  commit(ctx);
}

export function removeLink(ctx: StageCtx): void {
  const existing = linkAtSelection(ctx);
  if (existing) {
    while (existing.firstChild) existing.parentNode!.insertBefore(existing.firstChild, existing);
    existing.remove();
  } else {
    ctx.doc.execCommand('unlink');
  }
  commit(ctx);
}

export function linkAtSelection(ctx: StageCtx): HTMLAnchorElement | null {
  const sel = ctx.doc.getSelection();
  const node = sel?.anchorNode;
  if (!node) return null;
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  const a = el?.closest('a');
  return a && ctx.section.contains(a) ? (a as HTMLAnchorElement) : null;
}

/* ---------- block-level operations ---------- */

/** Change an element's tag, copying ALL attributes and children verbatim. */
export function renameElement(ctx: StageCtx, el: HTMLElement, tag: string): HTMLElement {
  const repl = ctx.doc.createElement(tag);
  for (const attr of el.attributes) repl.setAttribute(attr.name, attr.value);
  while (el.firstChild) repl.appendChild(el.firstChild);
  el.replaceWith(repl);
  commit(ctx);
  return repl;
}

/** Convert a text block to a list (its content becomes the first <li>). */
export function convertToList(ctx: StageCtx, el: HTMLElement, ordered: boolean): HTMLElement {
  const list = ctx.doc.createElement(ordered ? 'ol' : 'ul');
  const li = ctx.doc.createElement('li');
  while (el.firstChild) li.appendChild(el.firstChild);
  list.appendChild(li);
  el.replaceWith(list);
  commit(ctx);
  return list;
}

/** Convert a list back to paragraphs (one per <li>). */
export function convertListToParagraphs(ctx: StageCtx, list: HTMLElement): HTMLElement | null {
  let first: HTMLElement | null = null;
  const items = Array.from(list.querySelectorAll(':scope > li'));
  for (const li of items) {
    const p = ctx.doc.createElement('p');
    while (li.firstChild) p.appendChild(li.firstChild);
    list.parentNode!.insertBefore(p, list);
    if (!first) first = p;
  }
  list.remove();
  commit(ctx);
  return first;
}

export function deleteElement(ctx: StageCtx, el: HTMLElement): void {
  el.remove();
  useEditorStore.getState().select(null);
  commit(ctx);
}

export function duplicateElement(ctx: StageCtx, el: HTMLElement): HTMLElement {
  const clone = el.cloneNode(true) as HTMLElement;
  el.after(clone);
  useEditorStore.getState().select(clone);
  commit(ctx);
  return clone;
}

/**
 * Generic snippet insertion — images, code blocks, design-system components
 * all route through here. Inserted after `after`, or appended to the slide.
 */
export function insertHtmlSnippet(
  ctx: StageCtx,
  html: string,
  after?: HTMLElement | null,
  // Multi-step inserts (shape/chart: insert, then bake attributes + render)
  // pass false and commit once at the end — one insert, ONE undo step.
  commitNow = true,
): HTMLElement | null {
  const tpl = ctx.doc.createElement('template');
  tpl.innerHTML = html;
  const el = tpl.content.firstElementChild as HTMLElement | null;
  if (!el) return null;
  const node = ctx.doc.importNode(el, true);
  if (after && after.parentNode && ctx.section.contains(after)) {
    after.after(node);
  } else {
    ctx.section.appendChild(node);
  }
  useEditorStore.getState().select(node);
  if (commitNow) commit(ctx);
  return node;
}

/**
 * Wrap the current text selection in a styled span (range-level font/color).
 * extractContents splits partially-selected elements safely; the normalizer
 * preserves spans carrying these properties (see serializeSlide).
 */
export function wrapSelectionWithStyle(ctx: StageCtx, prop: string, value: string): boolean {
  const sel = ctx.doc.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
  const range = sel.getRangeAt(0);
  if (!ctx.section.contains(range.commonAncestorContainer)) return false;
  const span = ctx.doc.createElement('span');
  span.style.setProperty(prop, value);
  span.appendChild(range.extractContents());
  range.insertNode(span);
  sel.removeAllRanges();
  const after = ctx.doc.createRange();
  after.selectNodeContents(span);
  sel.addRange(after);
  commit(ctx);
  return true;
}

/* ---------- attributes & slide properties ---------- */

const BG_ATTRS = new Set(['data-background-color', 'data-background', 'data-background-image']);

/** Set/remove an attribute on the slide <section>; null removes it. */
export function setSectionAttr(ctx: StageCtx, name: string, value: string | null): void {
  if (value === null || value === '') ctx.section.removeAttribute(name);
  else ctx.section.setAttribute(name, value);
  if (BG_ATTRS.has(name)) paintStageBackground(ctx);
  commit(ctx);
}

/** Set/remove an attribute on any element; null removes it. */
export function setElementAttr(ctx: StageCtx, el: HTMLElement, name: string, value: string | null): void {
  if (value === null || value === '') el.removeAttribute(name);
  else el.setAttribute(name, value);
  commit(ctx);
}

/** Mirror data-background-* onto the static stage (the runtime isn't there to). */
export function paintStageBackground(ctx: StageCtx): void {
  const color =
    ctx.section.getAttribute('data-background-color') ??
    ctx.section.getAttribute('data-background') ??
    '';
  const image = ctx.section.getAttribute('data-background-image');
  const body = ctx.doc.body;
  body.style.background = color;
  body.style.backgroundImage = image ? `url("${image}")` : '';
  body.style.backgroundSize = image ? 'cover' : '';
  body.style.backgroundPosition = image ? 'center' : '';
}

/** Plain-text speaker notes (rich notes come later). Empty text removes the aside. */
export function setNotes(ctx: StageCtx, text: string): void {
  let aside = ctx.section.querySelector(':scope > aside.notes');
  if (text.trim() === '') {
    if (aside) aside.remove();
  } else {
    if (!aside) {
      aside = ctx.doc.createElement('aside');
      aside.className = 'notes';
      ctx.section.appendChild(aside);
    }
    aside.textContent = text;
  }
  commit(ctx);
}

export function getNotes(section: HTMLElement): string {
  return section.querySelector(':scope > aside.notes')?.textContent ?? '';
}

/** Adjacent CONTENT sibling in the same parent — speaker notes don't count. */
export function contentSibling(el: HTMLElement, dir: 'up' | 'down'): HTMLElement | null {
  let sib = dir === 'up' ? el.previousElementSibling : el.nextElementSibling;
  while (sib && sib.tagName === 'ASIDE') {
    sib = dir === 'up' ? sib.previousElementSibling : sib.nextElementSibling;
  }
  return sib as HTMLElement | null;
}

/** Move an element among its siblings (layers panel reorder = DOM order). */
export function moveSibling(ctx: StageCtx, el: HTMLElement, dir: 'up' | 'down'): boolean {
  const sib = contentSibling(el, dir);
  if (!sib) return false;
  if (dir === 'up') sib.before(el);
  else sib.after(el);
  commit(ctx);
  return true;
}

/* ---------- element clipboard ---------- */

let internalClipboard: string | null = null;

export function copyElement(el: HTMLElement): void {
  const clone = el.cloneNode(true) as HTMLElement;
  clone.removeAttribute('contenteditable');
  clone.removeAttribute('spellcheck');
  internalClipboard = clone.outerHTML;
  void navigator.clipboard?.writeText(internalClipboard).catch(() => undefined);
}

export function cutElement(ctx: StageCtx, el: HTMLElement): void {
  copyElement(el);
  deleteElement(ctx, el);
}

export function pasteElement(ctx: StageCtx, after?: HTMLElement | null): void {
  if (internalClipboard) insertHtmlSnippet(ctx, internalClipboard, after);
}

export function hasClipboard(): boolean {
  return internalClipboard !== null;
}
