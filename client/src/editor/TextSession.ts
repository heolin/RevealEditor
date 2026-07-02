/**
 * A scoped contenteditable session on ONE element. Native editing stays
 * confined to that element, so sibling markup can never be damaged.
 * Native undo is suppressed (app history owns Ctrl+Z); paste is plain-text.
 */
import { normalizeInlineMarkup } from './serializeSlide';

export interface TextSessionOptions {
  /** Called (debounced while typing, and on exit) after content changes. */
  onCommit(): void;
  /** Called exactly once after the session tears down. */
  onExit(): void;
  debounceMs?: number;
}

const ALLOWED_INPUT_PREFIXES = [
  'insertText',
  'insertParagraph',
  'insertLineBreak',
  'insertFromComposition',
  'insertCompositionText',
  'insertOrderedList',
  'insertUnorderedList',
  'delete',
  'format',
];

export class TextSession {
  readonly el: HTMLElement;
  private opts: Required<TextSessionOptions>;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dirtySinceCommit = false;
  private exited = false;
  private teardowns: (() => void)[] = [];

  constructor(el: HTMLElement, opts: TextSessionOptions) {
    this.el = el;
    this.opts = { debounceMs: 900, ...opts };
    this.start();
  }

  private listen<K extends keyof HTMLElementEventMap>(
    type: K,
    fn: (e: HTMLElementEventMap[K]) => void,
  ) {
    this.el.addEventListener(type, fn as EventListener);
    this.teardowns.push(() => this.el.removeEventListener(type, fn as EventListener));
  }

  private start() {
    const doc = this.el.ownerDocument;
    this.el.setAttribute('contenteditable', 'true');
    this.el.setAttribute('spellcheck', 'false');
    // Keep <b>/<i> semantics (normalized to strong/em on exit) instead of
    // browser-specific <span style> soup.
    try {
      doc.execCommand('styleWithCSS', false, 'false');
    } catch {
      /* non-fatal */
    }
    this.el.focus();

    this.listen('beforeinput', (e: InputEvent) => {
      const type = e.inputType || '';
      if (type === 'historyUndo' || type === 'historyRedo') {
        // App-level history owns undo — one Ctrl+Z behavior everywhere.
        e.preventDefault();
        return;
      }
      if (type === 'insertFromPaste' || type === 'insertFromDrop') {
        e.preventDefault();
        const text = e.dataTransfer?.getData('text/plain');
        if (text) doc.execCommand('insertText', false, text);
        return;
      }
      if (!ALLOWED_INPUT_PREFIXES.some((p) => type.startsWith(p))) {
        e.preventDefault();
      }
    });

    this.listen('input', () => {
      this.dirtySinceCommit = true;
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => this.flush(), this.opts.debounceMs);
    });

    this.listen('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.exit();
      }
    });

    this.listen('blur', () => {
      // Toolbar clicks steal focus momentarily; only exit if focus truly left.
      setTimeout(() => {
        if (!this.exited && doc.activeElement !== this.el) this.exit();
      }, 0);
    });
  }

  private flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.dirtySinceCommit) return;
    this.dirtySinceCommit = false;
    this.opts.onCommit();
  }

  /** Commit any pending changes without ending the session. */
  commitNow() {
    this.flush();
  }

  exit() {
    if (this.exited) return;
    this.exited = true;
    if (this.timer) clearTimeout(this.timer);
    for (const undo of this.teardowns) undo();
    this.el.removeAttribute('contenteditable');
    this.el.removeAttribute('spellcheck');
    normalizeInlineMarkup(this.el);
    // Commit unconditionally: normalization may have changed markup even
    // without pending input (the store skips identical sources anyway).
    this.dirtySinceCommit = false;
    this.opts.onCommit();
    this.opts.onExit();
  }

  /**
   * Tear down WITHOUT committing — used when the stage is about to rebuild
   * from external state (undo/redo, slide switch). Committing here would
   * overwrite the very state being restored.
   */
  dispose() {
    if (this.exited) return;
    this.exited = true;
    if (this.timer) clearTimeout(this.timer);
    for (const undo of this.teardowns) undo();
    this.el.removeAttribute('contenteditable');
    this.el.removeAttribute('spellcheck');
    this.opts.onExit();
  }
}
