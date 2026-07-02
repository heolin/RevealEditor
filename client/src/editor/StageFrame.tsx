import { useEffect, useMemo, useRef } from 'react';
import type { Slide } from '../model/deck';
import type { DeckMeta } from '../state/deckStore';
import { useDeckStore } from '../state/deckStore';
import { useEditorStore } from './editorStore';
import { slideElement } from '../model/deck';
import { resolveDeckUrl, themeUrl } from '../api/client';
import { TextSession } from './TextSession';
import { handlerFor, textEditableFrom } from './registry';
import { hydrateCodeBlocks } from './codeHighlight';
import {
  type StageCtx,
  commit,
  copyElement,
  cutElement,
  deleteElement,
  duplicateElement,
  pasteElement,
} from './commands';

/**
 * The editing surface: a same-origin iframe at slide design size (scaled by
 * the parent), loading reveal.css + theme but never the reveal runtime.
 * Owns hit-testing, selection drill-in, text-session lifecycle, and keyboard
 * handling while focus is inside the iframe.
 */
export function StageFrame({ slide, meta }: { slide: Slide | null; meta: DeckMeta }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const sessionRef = useRef<TextSession | null>(null);
  /** Source text we last injected or committed — used to skip echo rebuilds. */
  const cleanSource = useRef<string | null>(null);
  const ctxRef = useRef<StageCtx | null>(null);
  const slideRef = useRef(slide);
  slideRef.current = slide;

  const { width, height } = meta.config;

  const srcDoc = useMemo(() => {
    const dir = meta.path.includes('/')
      ? meta.path.slice(0, meta.path.lastIndexOf('/') + 1)
      : '';
    const userSheets = meta.stylesheets
      .filter((href) => !/reveal\.css|theme\/[\w-]+\.css/.test(href))
      .map((href) => `<link rel="stylesheet" href="${resolveDeckUrl(meta.path, href)}">`)
      .join('\n');
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<base href="/files/${dir}">
<link rel="stylesheet" href="/vendor/reveal.js/dist/reveal.css">
<link rel="stylesheet" href="${themeUrl(meta.path, meta.theme, meta.themeHref)}">
<link rel="stylesheet" href="/vendor/reveal.js/plugin/highlight/monokai.css">
${userSheets}
${meta.managedCss ? `<style>${meta.managedCss}</style>` : ''}
<style>
  html, body { margin: 0; overflow: hidden; width: 100%; height: 100%; }
  .reveal { position: relative; width: 100%; height: 100%; overflow: hidden; }
  .reveal .slides { position: absolute; inset: 0; width: ${width}px; height: ${height}px; }
  /* Replicate reveal's centered layout statically — the runtime never runs here. */
  .reveal .slides > section.present {
    position: static;
    display: flex !important;
    flex-direction: column;
    justify-content: center;
    width: 100%;
    height: 100%;
    top: 0;
  }
  .reveal .slides section .fragment {
    visibility: visible !important;
    opacity: 1 !important;
    transform: none !important;
  }
  aside.notes { display: none !important; }
  [contenteditable]:focus { outline: none; }
  .reveal .slides section :where(h1,h2,h3,h4,h5,h6,p,ul,ol,blockquote,img,pre,div,figure,table) {
    cursor: default;
  }
</style>
</head>
<body class="reveal-viewport">
<div class="reveal"><div class="slides"><section class="present" id="re-stage"></section></div></div>
</body>
</html>`;
  }, [meta.path, meta.theme, meta.themeHref, meta.stylesheets, meta.managedCss, width, height]);

  function endSession(commitFirst: boolean) {
    const session = sessionRef.current;
    if (!session) return;
    sessionRef.current = null;
    if (commitFirst) session.exit();
    else session.dispose();
  }

  function startSession(el: HTMLElement) {
    const ctx = ctxRef.current;
    if (!ctx) return;
    endSession(true);
    const editor = useEditorStore.getState();
    editor.select(el);
    sessionRef.current = new TextSession(el, {
      onCommit: () => commit(ctx),
      onExit: () => {
        if (useEditorStore.getState().sessionEl === el) {
          useEditorStore.getState().setSessionEl(null);
        }
      },
    });
    editor.setSessionEl(el);
  }

  /** Ancestor of `target` that is a direct child of `parent`. */
  function childOf(parent: Element, target: Element): HTMLElement | null {
    let el: Element | null = target;
    while (el && el.parentElement !== parent) el = el.parentElement;
    return (el as HTMLElement) ?? null;
  }

  function wireInteractions(doc: Document, section: HTMLElement) {
    doc.addEventListener('mousedown', (e) => {
      const target = e.target as Element;
      const editor = useEditorStore.getState();
      const session = sessionRef.current;
      if (session) {
        if (session.el.contains(target)) return; // keep editing
        endSession(true);
      }
      if (!section.contains(target) || target === section) {
        editor.select(null);
        return;
      }
      const top = childOf(section, target);
      const selected = editor.selectedEl;
      if (selected && (selected === target || selected.contains(target))) {
        // Click on the already-selected element: activate its editor.
        if (handlerFor(selected).type === 'code') {
          e.preventDefault();
          editor.setCodeEditEl(selected);
          return;
        }
        // Text elements enter editing directly (select once, click again to
        // edit — double-click still works too).
        if (handlerFor(selected).capabilities.textEdit) {
          const editable = textEditableFrom(target, section) ?? selected;
          // No preventDefault: the browser's own mousedown places the caret
          // at the click point once contenteditable is on.
          startSession(editable);
          return;
        }
        // Non-text containers: drill into nested markup one level per click.
        if (selected !== target && selected.children.length > 0) {
          const deeper = childOf(selected, target);
          if (deeper) {
            editor.select(deeper);
            return;
          }
        }
      }
      if (top) editor.select(top);
    });

    doc.addEventListener('dblclick', (e) => {
      const target = e.target as Element;
      if (!section.contains(target)) return;
      const pre = target.closest('pre');
      if (pre && section.contains(pre) && pre !== section) {
        e.preventDefault();
        useEditorStore.getState().setCodeEditEl(pre as HTMLElement);
        return;
      }
      const editable = textEditableFrom(target, section);
      if (editable && editable !== sessionRef.current?.el) {
        e.preventDefault();
        startSession(editable);
      }
    });

    doc.addEventListener('pointermove', (e) => {
      if (sessionRef.current) return;
      const target = e.target as Element;
      const editor = useEditorStore.getState();
      if (!section.contains(target) || target === section) {
        editor.hover(null);
        return;
      }
      const selected = editor.selectedEl;
      const hoverEl =
        selected && selected.contains(target) && selected !== target
          ? childOf(selected, target)
          : childOf(section, target);
      editor.hover(hoverEl === editor.selectedEl ? null : hoverEl);
    });
    doc.addEventListener('pointerleave', () => useEditorStore.getState().hover(null));

    // Toolbar formatting state + live selection box while typing.
    doc.addEventListener('selectionchange', () => useEditorStore.getState().bump());
    section.addEventListener('input', () => useEditorStore.getState().bump());

    doc.addEventListener('keydown', (e) => {
      const editor = useEditorStore.getState();
      const ctx = ctxRef.current;
      const mod = e.ctrlKey || e.metaKey;
      const inSession = !!sessionRef.current;

      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        endSession(true);
        void useDeckStore.getState().save();
        return;
      }
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        endSession(!inSession ? false : true);
        useDeckStore.temporal.getState().undo();
        return;
      }
      if ((mod && e.shiftKey && e.key.toLowerCase() === 'z') || (mod && e.key.toLowerCase() === 'y')) {
        e.preventDefault();
        endSession(false);
        useDeckStore.temporal.getState().redo();
        return;
      }
      if (inSession || !ctx) return;

      const selected = editor.selectedEl;
      if (e.key === 'Escape') {
        if (!selected) return;
        const parent = selected.parentElement;
        editor.select(parent && parent !== ctx.section ? parent : null);
        return;
      }
      if (!selected) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteElement(ctx, selected);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (handlerFor(selected).type === 'code') {
          editor.setCodeEditEl(selected);
          return;
        }
        const editable = textEditableFrom(selected, ctx.section) ?? null;
        if (editable) startSession(editable);
      } else if (mod && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        copyElement(selected);
      } else if (mod && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        cutElement(ctx, selected);
      } else if (mod && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        pasteElement(ctx, selected);
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateElement(ctx, selected);
      }
    });
  }

  function onFrameLoad() {
    const doc = iframeRef.current?.contentDocument;
    const section = doc?.getElementById('re-stage') as HTMLElement | null;
    if (!doc || !section) return;
    const ctx: StageCtx = {
      doc,
      section,
      get slideId() {
        return slideRef.current?.id ?? '';
      },
      markClean(source) {
        cleanSource.current = source;
      },
    };
    ctxRef.current = ctx;
    useEditorStore.getState().setCtx(ctx);
    useEditorStore.getState().setStartSession(startSession);
    wireInteractions(doc, section);
    cleanSource.current = null; // force injection
    inject();
  }

  function inject() {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const { section, doc } = ctx;
    endSession(false);
    useEditorStore.getState().reset();

    for (const name of section.getAttributeNames()) {
      if (name !== 'id') section.removeAttribute(name);
    }
    section.className = 'present';
    const slide = slideRef.current;
    if (!slide) {
      section.innerHTML = '';
      cleanSource.current = null;
      return;
    }
    const parsed = slideElement(slide.source);
    if (!parsed) return;
    for (const attr of parsed.attributes) {
      if (attr.name === 'class') section.className = `${attr.value} present`;
      else section.setAttribute(attr.name, attr.value);
    }
    section.innerHTML = parsed.innerHTML;
    hydrateCodeBlocks(section);
    const bg =
      parsed.getAttribute('data-background-color') ??
      parsed.getAttribute('data-background') ??
      '';
    const bgImage = parsed.getAttribute('data-background-image');
    doc.body.style.background = bg;
    doc.body.style.backgroundImage = bgImage ? `url("${bgImage}")` : '';
    doc.body.style.backgroundSize = bgImage ? 'cover' : '';
    doc.body.style.backgroundPosition = bgImage ? 'center' : '';
    cleanSource.current = slide.source;
  }

  // Rebuild the stage DOM when the slide changes externally (slide switch,
  // undo/redo, sorter ops) — but not on our own commit echo.
  useEffect(() => {
    if (!ctxRef.current) return;
    if (slide && slide.source === cleanSource.current) return;
    inject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide?.id, slide?.source]);

  useEffect(
    () => () => {
      endSession(false);
      useEditorStore.getState().setCtx(null);
      useEditorStore.getState().reset();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <iframe
      ref={iframeRef}
      title="Slide editor"
      srcDoc={srcDoc}
      onLoad={onFrameLoad}
      style={{ width, height, border: 'none', display: 'block' }}
    />
  );
}
