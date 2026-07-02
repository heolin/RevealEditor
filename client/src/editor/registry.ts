/**
 * The element handler registry — the editor's extensibility core.
 * Every element on a slide is claimed by exactly one handler; adding a
 * content type (table, chart, shape, …) means adding a handler here.
 */

export interface ElementHandler {
  type: string;
  /** Higher priority wins; 'generic' is the catch-all at -Infinity. */
  priority: number;
  match(el: Element): boolean;
  capabilities: {
    /** Double-click opens a contenteditable text session. */
    textEdit: boolean;
    delete: boolean;
    /** Which resize handles the selection box offers. */
    resize: 'none' | 'width' | 'both';
  };
}

const BLOCKISH =
  'div,section,article,ul,ol,table,pre,img,svg,iframe,video,audio,figure,' +
  'h1,h2,h3,h4,h5,h6,p,blockquote,hr,aside';

/** Content is inline-only (safe to contenteditable as a unit). */
export function hasInlineOnlyContent(el: Element): boolean {
  return !el.querySelector(BLOCKISH);
}

const TEXT_TAGS = new Set([
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'P', 'BLOCKQUOTE', 'FIGCAPTION', 'LI',
  'TD', 'TH', 'CAPTION',
]);

export const textHandler: ElementHandler = {
  type: 'text',
  priority: 10,
  match(el) {
    if (TEXT_TAGS.has(el.tagName)) return true;
    // Lists edit as a unit so Enter creates new <li>s.
    if (el.tagName === 'UL' || el.tagName === 'OL') return true;
    if (el.tagName === 'DIV' || el.tagName === 'SPAN' || el.tagName === 'A') {
      return hasInlineOnlyContent(el);
    }
    return false;
  },
  capabilities: { textEdit: true, delete: true, resize: 'width' },
};

/** Charts: figure with data-re-chart spec + baked SVG; edited in the chart modal. */
export const chartHandler: ElementHandler = {
  type: 'chart',
  priority: 50,
  match: (el) => el.hasAttribute('data-re-chart'),
  capabilities: { textEdit: false, delete: true, resize: 'both' },
};

/** Shapes: svg with data-re-shape params; styled via the Inspector. The
 *  class fallback recognizes shapes from decks saved while serialization
 *  stripped data-re-* attributes. */
export const shapeHandler: ElementHandler = {
  type: 'shape',
  priority: 45,
  match: (el) =>
    el.hasAttribute('data-re-shape') ||
    (el.tagName === 'svg' && el.classList.contains('re-shape')),
  capabilities: { textEdit: false, delete: true, resize: 'both' },
};

/** Tables: cell content edits via text sessions; structure via table commands. */
export const tableHandler: ElementHandler = {
  type: 'table',
  priority: 30,
  match: (el) => el.tagName === 'TABLE',
  // textEdit=true delegates to the clicked cell (textEditableFrom skips the
  // table element itself — a contenteditable TABLE would be destructive).
  capabilities: { textEdit: true, delete: true, resize: 'width' },
};

/** <pre><code> blocks — edited via the code editor modal, never contenteditable. */
export const codeHandler: ElementHandler = {
  type: 'code',
  priority: 20,
  match: (el) => el.tagName === 'PRE',
  capabilities: { textEdit: false, delete: true, resize: 'width' },
};

export const imageHandler: ElementHandler = {
  type: 'image',
  priority: 20,
  match: (el) => el.tagName === 'IMG',
  capabilities: { textEdit: false, delete: true, resize: 'both' },
};

/** Never claims text editing; subtree is preserved untouched. */
export const genericHandler: ElementHandler = {
  type: 'generic',
  priority: -Infinity,
  match: () => true,
  capabilities: { textEdit: false, delete: true, resize: 'both' },
};

const HANDLERS: ElementHandler[] = [
  chartHandler,
  shapeHandler,
  tableHandler,
  codeHandler,
  imageHandler,
  textHandler,
  genericHandler,
].sort((a, b) => b.priority - a.priority);

export function handlerFor(el: Element): ElementHandler {
  return HANDLERS.find((h) => h.match(el))!;
}

/** Register future handlers (image, code, table, chart, …). */
export function registerHandler(handler: ElementHandler): void {
  HANDLERS.push(handler);
  HANDLERS.sort((a, b) => b.priority - a.priority);
}

/**
 * The deepest text-editable element on the path from `target` up to (not
 * including) `boundary`, preferring the innermost eligible ancestor.
 */
export function textEditableFrom(
  target: Element,
  boundary: Element,
): HTMLElement | null {
  let el: Element | null = target;
  while (el && el !== boundary) {
    // A table's textEdit capability means "edit cells", never the table node.
    if (el.tagName === 'TABLE') {
      el = el.parentElement;
      continue;
    }
    const handler = handlerFor(el);
    if (handler.capabilities.textEdit) {
      // Whole-list editing: prefer the list over the individual <li>.
      if (el.tagName === 'LI') {
        const list = el.closest('ul,ol');
        if (list && boundary.contains(list) && list !== boundary) {
          return list as HTMLElement;
        }
      }
      return el as HTMLElement;
    }
    el = el.parentElement;
  }
  return null;
}
