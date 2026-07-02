/**
 * Client deck model: columns (horizontal axis) of slides (vertical stacks).
 *
 * Slides hold their exact source text from the file, and their `leading`
 * text — the whitespace and comments that preceded them in the file — so
 * comments travel with their slide on reorder and an order-preserving save
 * is byte-identical by construction. A column keeps `originalSource` (the
 * pristine byte slice of its top-level <section>) until something inside it
 * changes; untouched columns re-emit verbatim.
 */
import { nanoid } from 'nanoid';
import type { SectionInfo } from '../api/client';

export interface Slide {
  id: string; // session-only, never serialized
  attrsText: string; // raw attribute text, exactly as written
  source: string; // full <section …>…</section> source text
  leading: string; // whitespace/comments before this section in the file
}

export interface Column {
  id: string;
  isStack: boolean;
  /** Raw attribute text of the stack wrapper <section> (stacks only). */
  wrapperAttrsText: string;
  /** Stacks only: text between the last child and the wrapper's </section>. */
  innerTrailing: string;
  leading: string;
  slides: Slide[];
  /** Pristine source of the whole top-level section; dropped on first edit. */
  originalSource?: string;
}

export interface SlidesLayout {
  slidesTrailing: string;
  sectionIndent: string;
}

export function parseSections(sections: SectionInfo[]): Column[] {
  return sections.map((s) => {
    if (s.children && s.children.length > 0) {
      return {
        id: nanoid(8),
        isStack: true,
        wrapperAttrsText: s.attrsText,
        innerTrailing: s.innerTrailing ?? '\n',
        leading: s.leading,
        slides: s.children.map((c) => ({
          id: nanoid(8),
          attrsText: c.attrsText,
          source: c.source,
          leading: c.leading,
        })),
        originalSource: s.source,
      };
    }
    return {
      id: nanoid(8),
      isStack: false,
      wrapperAttrsText: '',
      innerTrailing: '\n',
      leading: s.leading,
      slides: [
        { id: nanoid(8), attrsText: s.attrsText, source: s.source, leading: s.leading },
      ],
      originalSource: s.source,
    };
  });
}

export function composeColumn(col: Column): string {
  if (col.originalSource !== undefined) return col.originalSource;
  if (!col.isStack) return col.slides[0].source;
  const inner = col.slides.map((s) => s.leading + s.source).join('');
  return `<section${col.wrapperAttrsText}>${inner}${col.innerTrailing}</section>`;
}

/** Compose the full inner HTML of <div class="slides"> for saving / preview. */
export function composeSlides(columns: Column[], layout: SlidesLayout): string {
  const body = columns.map((col) => col.leading + composeColumn(col)).join('');
  return body + layout.slidesTrailing;
}

/** Parse one slide's source into a detached DOM element (for canvas rendering). */
export function slideElement(source: string): HTMLElement | null {
  const tpl = document.createElement('template');
  tpl.innerHTML = source;
  const el = tpl.content.firstElementChild;
  return el instanceof HTMLElement ? el : null;
}

export function newSlideSource(indent: string): string {
  return `<section>\n${indent}  <h2>New slide</h2>\n${indent}</section>`;
}

/** Find (columnIndex, slideIndex) — reveal's (h, v) coordinates — for a slide id. */
export function findSlide(
  columns: Column[],
  slideId: string,
): { h: number; v: number } | null {
  for (let h = 0; h < columns.length; h++) {
    const v = columns[h].slides.findIndex((s) => s.id === slideId);
    if (v >= 0) return { h, v };
  }
  return null;
}
