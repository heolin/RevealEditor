/**
 * Code blocks: the raw code TEXT is the truth; highlight.js markup is
 * display-only, lives only in the stage DOM, and is never serialized.
 *
 * `rawCode` maps live <code> elements to their true text. `hydrateCodeBlocks`
 * records raw text and paints highlighted display markup; serializeSlide
 * restores raw text into its clone before producing slide source.
 */
import hljs from 'highlight.js';

export const rawCode = new WeakMap<Element, string>();

export function languageOf(codeEl: Element): string | null {
  for (const cls of Array.from(codeEl.classList)) {
    if (cls.startsWith('language-')) return cls.slice('language-'.length);
    if (cls.startsWith('lang-')) return cls.slice('lang-'.length);
  }
  return null;
}

/** Record raw text and apply display highlighting to every code block. */
export function hydrateCodeBlocks(section: HTMLElement): void {
  for (const code of Array.from(section.querySelectorAll('pre > code'))) {
    if (!rawCode.has(code)) rawCode.set(code, code.textContent ?? '');
    paint(code);
  }
}

/** Update a code block's raw text (from the code editor) and repaint. */
export function setCodeText(codeEl: Element, text: string): void {
  rawCode.set(codeEl, text);
  paint(codeEl);
}

export function codeTextOf(codeEl: Element): string {
  return rawCode.get(codeEl) ?? codeEl.textContent ?? '';
}

function paint(codeEl: Element): void {
  const raw = rawCode.get(codeEl) ?? '';
  const lang = languageOf(codeEl);
  try {
    if (lang && hljs.getLanguage(lang)) {
      codeEl.innerHTML = hljs.highlight(raw, { language: lang }).value;
      return;
    }
  } catch {
    /* fall through to plain text */
  }
  codeEl.textContent = raw;
}

/**
 * Restore raw code text into a serialization CLONE. Clones aren't WeakMap
 * keys, so originals and clones are matched by document order.
 */
export function restoreRawCode(original: HTMLElement, clone: HTMLElement): void {
  const origCodes = Array.from(original.querySelectorAll('pre > code'));
  const cloneCodes = Array.from(clone.querySelectorAll('pre > code'));
  for (let i = 0; i < cloneCodes.length; i++) {
    const raw = origCodes[i] ? rawCode.get(origCodes[i]) : undefined;
    if (raw !== undefined) cloneCodes[i].textContent = raw;
  }
}

export const COMMON_LANGUAGES = [
  'javascript', 'typescript', 'python', 'html', 'css', 'json', 'bash',
  'java', 'c', 'cpp', 'csharp', 'go', 'rust', 'ruby', 'php', 'sql',
  'yaml', 'markdown', 'kotlin', 'swift', 'plaintext',
];
