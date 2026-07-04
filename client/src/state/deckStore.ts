import { create } from 'zustand';
import { useShallow } from 'zustand/shallow';
import { temporal } from 'zundo';
import { nanoid } from 'nanoid';
import { api, type DeckData, ApiError } from '../api/client';
import {
  type Column,
  type Slide,
  type SlidesLayout,
  parseSections,
  composeSlides,
  newSlideSource,
  findSlide,
} from '../model/deck';

export interface DeckMeta {
  path: string;
  title: string;
  theme: string | null;
  themeHref: string | null;
  stylesheets: string[];
  headStyles: string[];
  managedCss: string;
  config: { width: number; height: number; center: boolean; margin: number; slideNumber: boolean };
  layout: SlidesLayout;
}

interface DeckState {
  columns: Column[];
  meta: DeckMeta | null;
  mtime: number;
  selectedSlideId: string | null;
  dirty: boolean;
  saving: boolean;
  conflict: boolean;
  /** Deck-relative stylesheet hrefs to add to the head on next save. */
  pendingLinks: string[];
  /** Reveal config values to splice into the file on next save. */
  pendingConfig: { width?: number; height?: number; slideNumber?: boolean } | null;

  load(deck: DeckData): void;
  close(): void;
  select(slideId: string | null): void;

  addSlideAtEnd(): void;
  addSlideAfterColumn(columnId: string): void;
  addSlideBelow(slideId: string): void;
  /** Insert a slide from clipboard-carried <section> source (cross-deck paste). */
  addSlideFromSource(source: string): void;
  duplicateSlide(slideId: string): void;
  /** Duplicate a slide as the next auto-animate step: copy it and flag BOTH the
   *  original and the copy with `data-auto-animate` so reveal morphs between them. */
  duplicateSlideForAutoAnimate(slideId: string): void;
  deleteSlide(slideId: string): void;
  moveColumn(columnId: string, gapIndex: number): void;
  moveSlideToSlot(slideId: string, columnId: string, index: number): void;
  moveSlideToGap(slideId: string, gapIndex: number): void;
  setTheme(theme: string): void;
  /** Replace the editor-managed style block contents (table presets, tokens). */
  setManagedCss(css: string): void;
  /** Link stylesheets into the deck head (applied immediately, spliced on save). */
  linkStylesheets(hrefs: string[]): void;
  /** Change the slide design size (applied immediately, spliced on save). */
  setDeckSize(width: number, height: number): void;
  /** Toggle reveal's slide numbers (spliced into the config on save). */
  setSlideNumber(on: boolean): void;
  /** Newer on-disk mtime observed by the freshness poll (null = in sync). */
  externalMtime: number | null;
  setExternalMtime(mtime: number | null): void;
  /** Discard in-memory state and reload the deck from disk. */
  reloadFromDisk(): Promise<void>;
  /** Commit edited slide markup from the editing engine (no-op if unchanged). */
  updateSlideSource(slideId: string, source: string): void;

  save(opts?: { force?: boolean }): Promise<void>;
  dismissConflict(): void;
}

/** Mark a column as edited: its pristine source no longer represents it. */
function touched(col: Column): Column {
  const { originalSource: _drop, ...rest } = col;
  return rest;
}

/** Add a bare boolean attribute to a section source's opening tag if absent.
 *  Byte-surgical: only the `<section …>` tag is touched, everything else is
 *  preserved verbatim (used by the store-level ops that have no live stage). */
function withSectionFlag(source: string, attr: string): string {
  const m = /<section\b([^>]*)>/.exec(source);
  if (!m) return source;
  const attrs = m[1];
  if (new RegExp(`(^|\\s)${attr}(?=[\\s=]|$)`).test(attrs)) return source;
  return source.replace(m[0], `<section${attrs} ${attr}>`);
}

function makeSlide(indent: string, source?: string, attrsText = ''): Slide {
  return {
    id: nanoid(8),
    attrsText,
    source: source ?? newSlideSource(indent),
    leading: `\n${indent}`,
  };
}

function makeColumn(indent: string, slides: Slide[]): Column {
  return {
    id: nanoid(8),
    isStack: slides.length > 1,
    wrapperAttrsText: '',
    innerTrailing: `\n${indent}`,
    leading: `\n${indent}`,
    slides,
  };
}

/** Remove a slide; drop the column entirely if it becomes empty; unwrap 1-slide stacks. */
function removeSlide(columns: Column[], slideId: string): { columns: Column[]; removed: Slide | null } {
  let removed: Slide | null = null;
  const next: Column[] = [];
  for (const col of columns) {
    const idx = col.slides.findIndex((s) => s.id === slideId);
    if (idx < 0) {
      next.push(col);
      continue;
    }
    removed = col.slides[idx];
    const slides = col.slides.filter((s) => s.id !== slideId);
    if (slides.length === 0) continue;
    let updated = touched({ ...col, slides });
    // A stack with one slide left and no wrapper attrs of its own unwraps to a plain slide.
    if (updated.isStack && slides.length === 1 && updated.wrapperAttrsText.trim() === '') {
      updated = { ...updated, isStack: false };
    }
    next.push(updated);
  }
  return { columns: next, removed };
}

export const useDeckStore = create<DeckState>()(
  temporal(
    (set, get) => ({
      columns: [],
      meta: null,
      mtime: 0,
      selectedSlideId: null,
      dirty: false,
      saving: false,
      conflict: false,
      pendingLinks: [],
      pendingConfig: null,
      externalMtime: null,

      load(deck) {
        const columns = parseSections(deck.sections);
        set({
          columns,
          meta: {
            path: deck.path,
            title: deck.title,
            theme: deck.theme,
            themeHref: deck.themeHref,
            stylesheets: deck.stylesheets,
            headStyles: deck.headStyles,
            managedCss: deck.managedCss,
            config: deck.config,
            layout: {
              slidesTrailing: deck.slidesTrailing,
              sectionIndent: deck.sectionIndent,
            },
          },
          mtime: deck.mtime,
          selectedSlideId: columns[0]?.slides[0]?.id ?? null,
          dirty: false,
          conflict: false,
          pendingLinks: [],
          pendingConfig: null,
          externalMtime: null,
        });
        // Clear AFTER the set: the set itself records the pre-load state
        // (an empty or stale deck) as an undo entry — Ctrl+Z must never be
        // able to go back past "deck as loaded from disk".
        useDeckStore.temporal.getState().clear();
      },

      close() {
        set({ columns: [], meta: null, selectedSlideId: null, dirty: false, conflict: false });
        useDeckStore.temporal.getState().clear();
      },

      select(slideId) {
        set({ selectedSlideId: slideId });
      },

      addSlideAtEnd() {
        const { columns, meta } = get();
        if (!meta) return;
        const indent = meta.layout.sectionIndent;
        const slide = makeSlide(indent);
        set({
          columns: [...columns, makeColumn(indent, [slide])],
          selectedSlideId: slide.id,
          dirty: true,
        });
      },

      addSlideAfterColumn(columnId) {
        const { columns, meta } = get();
        const indent = meta!.layout.sectionIndent;
        const idx = columns.findIndex((c) => c.id === columnId);
        if (idx < 0) return;
        const slide = makeSlide(indent);
        const next = [...columns];
        next.splice(idx + 1, 0, makeColumn(indent, [slide]));
        set({ columns: next, selectedSlideId: slide.id, dirty: true });
      },

      addSlideFromSource(source) {
        const { columns, meta } = get();
        if (!meta || !/^<section[\s>]/i.test(source.trim())) return;
        const indent = meta.layout.sectionIndent;
        const slide = makeSlide(indent, source.trim());
        set({
          columns: [...columns, makeColumn(indent, [slide])],
          selectedSlideId: slide.id,
          dirty: true,
        });
      },

      addSlideBelow(slideId) {
        const { columns, meta } = get();
        const childIndent = `${meta!.layout.sectionIndent}  `;
        const slide = makeSlide(childIndent);
        const next = columns.map((col) => {
          const idx = col.slides.findIndex((s) => s.id === slideId);
          if (idx < 0) return col;
          const slides = col.slides.map((s) =>
            // A slide converting from plain column to stack child needs a
            // stack-appropriate leading (its old one was the column's own).
            col.isStack ? s : { ...s, leading: `\n${childIndent}` },
          );
          slides.splice(idx + 1, 0, slide);
          return touched({ ...col, isStack: true, slides });
        });
        set({ columns: next, selectedSlideId: slide.id, dirty: true });
      },

      duplicateSlide(slideId) {
        const { columns, meta } = get();
        const indent = meta!.layout.sectionIndent;
        let dupId: string | null = null;
        const next: Column[] = [];
        for (const col of columns) {
          const idx = col.slides.findIndex((s) => s.id === slideId);
          if (idx < 0) {
            next.push(col);
            continue;
          }
          const orig = col.slides[idx];
          if (col.isStack) {
            const dup = { ...makeSlide(`${indent}  `, orig.source, orig.attrsText) };
            dupId = dup.id;
            const slides = [...col.slides];
            slides.splice(idx + 1, 0, dup);
            next.push(touched({ ...col, slides }));
          } else {
            const dup = makeSlide(indent, orig.source, orig.attrsText);
            dupId = dup.id;
            next.push(col, makeColumn(indent, [dup]));
          }
        }
        set({ columns: next, selectedSlideId: dupId, dirty: true });
      },

      duplicateSlideForAutoAnimate(slideId) {
        const { columns, meta } = get();
        const indent = meta!.layout.sectionIndent;
        let dupId: string | null = null;
        const next: Column[] = [];
        for (const col of columns) {
          const idx = col.slides.findIndex((s) => s.id === slideId);
          if (idx < 0) {
            next.push(col);
            continue;
          }
          const orig = col.slides[idx];
          const animSource = withSectionFlag(orig.source, 'data-auto-animate');
          if (col.isStack) {
            const dup = makeSlide(`${indent}  `, animSource, orig.attrsText);
            dupId = dup.id;
            const slides = [...col.slides];
            slides[idx] = { ...orig, source: animSource };
            slides.splice(idx + 1, 0, dup);
            next.push(touched({ ...col, slides }));
          } else {
            const dup = makeSlide(indent, animSource, orig.attrsText);
            dupId = dup.id;
            next.push(
              touched({ ...col, slides: [{ ...orig, source: animSource }] }),
              makeColumn(indent, [dup]),
            );
          }
        }
        set({ columns: next, selectedSlideId: dupId, dirty: true });
      },

      deleteSlide(slideId) {
        const { columns, selectedSlideId } = get();
        const pos = findSlide(columns, slideId);
        const { columns: next } = removeSlide(columns, slideId);
        let selected = selectedSlideId;
        if (selectedSlideId === slideId) {
          const h = Math.min(pos?.h ?? 0, next.length - 1);
          selected = h >= 0 ? next[h]?.slides[0]?.id ?? null : null;
        }
        set({ columns: next, selectedSlideId: selected, dirty: true });
      },

      moveColumn(columnId, gapIndex) {
        const { columns } = get();
        const idx = columns.findIndex((c) => c.id === columnId);
        if (idx < 0) return;
        const next = [...columns];
        const [col] = next.splice(idx, 1);
        const insertAt = gapIndex > idx ? gapIndex - 1 : gapIndex;
        next.splice(insertAt, 0, col);
        set({ columns: next, dirty: true });
      },

      moveSlideToSlot(slideId, columnId, index) {
        const { columns } = get();
        const from = findSlide(columns, slideId);
        if (!from) return;
        // Same-column move: adjust target index for the removal.
        const fromCol = columns[from.h];
        let targetIndex = index;
        if (fromCol.id === columnId) {
          if (fromCol.slides.length === 1) return;
          if (from.v < index) targetIndex -= 1;
          if (targetIndex === from.v) return;
        }
        const { columns: without, removed } = removeSlide(columns, slideId);
        if (!removed) return;
        const next = without.map((col) => {
          if (col.id !== columnId) return col;
          const slides = [...col.slides];
          slides.splice(Math.min(targetIndex, slides.length), 0, removed);
          return touched({ ...col, isStack: slides.length > 1, slides });
        });
        // Target column may have been dropped (it emptied) — bail to a gap move instead.
        if (!next.some((c) => c.id === columnId)) return;
        set({ columns: next, dirty: true });
      },

      moveSlideToGap(slideId, gapIndex) {
        const { columns, meta } = get();
        const indent = meta!.layout.sectionIndent;
        const from = findSlide(columns, slideId);
        if (!from) return;
        // No-op: single-slide column dropped into an adjacent gap around itself.
        if (
          columns[from.h].slides.length === 1 &&
          (gapIndex === from.h || gapIndex === from.h + 1)
        ) {
          return;
        }
        const removedBefore =
          columns[from.h].slides.length === 1 && from.h < gapIndex ? 1 : 0;
        const { columns: without, removed } = removeSlide(columns, slideId);
        if (!removed) return;
        const next = [...without];
        next.splice(gapIndex - removedBefore, 0, makeColumn(indent, [removed]));
        set({ columns: next, dirty: true });
      },

      setTheme(theme) {
        const { meta } = get();
        if (!meta) return;
        set({ meta: { ...meta, theme, themeHref: null }, dirty: true });
      },

      setManagedCss(css) {
        const { meta } = get();
        if (!meta || meta.managedCss === css) return;
        set({ meta: { ...meta, managedCss: css }, dirty: true });
      },

      setDeckSize(width, height) {
        const { meta, pendingConfig } = get();
        if (!meta || (meta.config.width === width && meta.config.height === height)) return;
        set({
          meta: { ...meta, config: { ...meta.config, width, height } },
          pendingConfig: { ...pendingConfig, width, height },
          dirty: true,
        });
      },

      setSlideNumber(on) {
        const { meta, pendingConfig } = get();
        if (!meta || meta.config.slideNumber === on) return;
        set({
          meta: { ...meta, config: { ...meta.config, slideNumber: on } },
          pendingConfig: { ...pendingConfig, slideNumber: on },
          dirty: true,
        });
      },

      setExternalMtime(mtime) {
        set({ externalMtime: mtime });
      },

      async reloadFromDisk() {
        const { meta } = get();
        if (!meta) return;
        const deck = await api.getDeck(meta.path);
        get().load(deck);
        set({ externalMtime: null });
      },

      linkStylesheets(hrefs) {
        const { meta, pendingLinks } = get();
        if (!meta) return;
        const missing = hrefs.filter(
          (h) => !meta.stylesheets.includes(h) && !pendingLinks.includes(h),
        );
        if (missing.length === 0) return;
        set({
          meta: { ...meta, stylesheets: [...meta.stylesheets, ...missing] },
          pendingLinks: [...pendingLinks, ...missing],
          dirty: true,
        });
      },

      updateSlideSource(slideId, source) {
        const { columns } = get();
        const current = columns
          .flatMap((c) => c.slides)
          .find((s) => s.id === slideId);
        if (!current || current.source === source) return;
        const next = columns.map((col) => {
          const idx = col.slides.findIndex((s) => s.id === slideId);
          if (idx < 0) return col;
          const slides = [...col.slides];
          slides[idx] = { ...slides[idx], source };
          return touched({ ...col, slides });
        });
        set({ columns: next, dirty: true });
      },

      async save(opts) {
        const { meta, columns, mtime, saving, pendingLinks, pendingConfig } = get();
        if (!meta || saving) return;
        set({ saving: true });
        try {
          const res = await api.saveDeck(meta.path, {
            slidesHtml: composeSlides(columns, meta.layout),
            theme: meta.theme ?? undefined,
            managedCss: meta.managedCss || undefined,
            addStylesheetLinks: pendingLinks.length ? pendingLinks : undefined,
            configPatch: pendingConfig ?? undefined,
            baseMtime: mtime,
            force: opts?.force,
          });
          set({
            mtime: res.mtime,
            dirty: false,
            conflict: false,
            pendingLinks: [],
            pendingConfig: null,
            externalMtime: null,
          });
        } catch (err) {
          if (err instanceof ApiError && err.status === 409) {
            set({ conflict: true });
          } else {
            throw err;
          }
        } finally {
          set({ saving: false });
        }
      },

      dismissConflict() {
        set({ conflict: false });
      },
    }),
    {
      partialize: (state) => ({ columns: state.columns }),
      limit: 200,
      equality: (a, b) => a.columns === b.columns,
    },
  ),
);

// findSlide returns a fresh {h, v} object each call — shallow-compare it so
// the selector doesn't produce a new snapshot every render (infinite loop).
export function useSelectedPosition(): { h: number; v: number } | null {
  return useDeckStore(
    useShallow((s) =>
      s.selectedSlideId ? findSlide(s.columns, s.selectedSlideId) : null,
    ),
  );
}
