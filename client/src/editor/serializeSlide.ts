/**
 * Serialization hygiene: turn the live stage <section> back into clean slide
 * source. Works on a deep clone — the live DOM is never touched. Everything
 * the editor injects must be stripped here; the invariant is that saved
 * output never contains editor artifacts.
 */

import { restoreRawCode } from './codeHighlight';

const EDITOR_ATTRS = ['contenteditable', 'spellcheck', 'draggable'];

/** data-re-* attrs that are part of the FILE FORMAT, not editor state:
 *  shape/chart spec JSON, the free-layout section marker, and the stable
 *  element ids connector attachments reference. */
const PERSISTENT_RE_ATTRS = ['data-re-shape', 'data-re-chart', 'data-re-free', 'data-re-id'];

export function serializeSlide(stageSection: HTMLElement): string {
  const clone = stageSection.cloneNode(true) as HTMLElement;

  // The stage host carries an editor id and the 'present' state class.
  clone.removeAttribute('id');
  stripClass(clone, 'present');

  // Display-only highlight markup out; raw code text back in.
  restoreRawCode(stageSection, clone);

  // A shape label the user left empty is scaffolding, not content.
  for (const label of clone.querySelectorAll('.re-shape-label')) {
    if (!label.textContent?.trim()) label.closest('foreignObject')?.remove();
  }

  for (const el of [clone, ...clone.querySelectorAll('*')]) {
    for (const attr of EDITOR_ATTRS) el.removeAttribute(attr);
    for (const name of el.getAttributeNames()) {
      if (name.startsWith('data-re-') && !PERSISTENT_RE_ATTRS.includes(name)) {
        el.removeAttribute(name);
      }
    }
    // Fragment preview state is runtime-only (M3 stepper writes these).
    stripClass(el, 'visible');
    stripClass(el, 'current-fragment');
    if (el.getAttribute('class') === '') el.removeAttribute('class');
    if (el.getAttribute('style') === '') el.removeAttribute('style');
  }

  return clone.outerHTML;
}

function stripClass(el: Element, cls: string): void {
  if (el.classList.contains(cls)) {
    el.classList.remove(cls);
    if (el.classList.length === 0) el.removeAttribute('class');
  }
}

/**
 * Conservative cleanup of one just-edited text element: undo the browser's
 * contenteditable droppings without touching anything the user authored.
 * Only mutates markup patterns that are unambiguously editor-generated.
 */
export function normalizeInlineMarkup(root: HTMLElement): void {
  const doc = root.ownerDocument;

  // <b>/<i> produced by execCommand → <strong>/<em>, but ONLY when the tag
  // has no attributes (an <i class="fa fa-x"> icon must survive).
  for (const tag of ['b', 'i']) {
    for (const el of Array.from(root.querySelectorAll(tag))) {
      if (el.attributes.length > 0) continue;
      const repl = doc.createElement(tag === 'b' ? 'strong' : 'em');
      while (el.firstChild) repl.appendChild(el.firstChild);
      el.replaceWith(repl);
    }
  }

  // WebKit wraps edits in <span style="…"> droppings. But spans carrying
  // color/font styling are INTENTIONAL (range formatting from the toolbar) —
  // only unwrap spans whose style is limited to weight/style/decoration
  // noise that semantic tags (strong/em/s) already express.
  const INTENTIONAL = ['color', 'background-color', 'font-family', 'font-size'];
  for (const span of Array.from(root.querySelectorAll('span[style]'))) {
    if (span.attributes.length !== 1) continue; // user spans with class/id etc.
    const el = span as HTMLElement;
    const props = Array.from(el.style);
    if (props.some((p) => INTENTIONAL.includes(p))) continue;
    while (span.firstChild) span.parentNode!.insertBefore(span.firstChild, span);
    span.remove();
  }

  // Empty inline formatting elements left behind by deletions.
  for (const tag of ['strong', 'em', 'b', 'i', 'a', 'span']) {
    for (const el of Array.from(root.querySelectorAll(tag))) {
      if (el.attributes.length === 0 && el.textContent === '' && el.children.length === 0) {
        el.remove();
      }
    }
  }
}
