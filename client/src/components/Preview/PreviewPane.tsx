import { useEffect, useRef, useState } from 'react';
import { Button } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { useDeckStore, useSelectedPosition } from '../../state/deckStore';
import { composeSlides } from '../../model/deck';
import { REVEAL_CSS_RE, themeUrl } from '../../api/client';

/**
 * Live preview: the real reveal.js runtime in a disposable iframe.
 * One-way data flow — slides are pushed in via postMessage, nothing is
 * ever read back, so reveal's DOM mutations can't contaminate the model.
 */
export function PreviewPane() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [open, setOpen] = useState(true);
  const pos = useSelectedPosition();
  const posRef = useRef(pos);
  posRef.current = pos;

  // Push a (debounced) sync whenever slides or theme change.
  useEffect(() => {
    if (!open) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastColumns: unknown = null;
    let lastTheme: unknown = null;

    function buildAndSend() {
      const s = useDeckStore.getState();
      if (!s.meta) return;
      const dir = s.meta.path.includes('/')
        ? s.meta.path.slice(0, s.meta.path.lastIndexOf('/') + 1)
        : '';
      const extra = s.meta.stylesheets.filter((href) => !REVEAL_CSS_RE.test(href));
      iframeRef.current?.contentWindow?.postMessage(
        {
          type: 'sync',
          slidesHtml: composeSlides(s.columns, s.meta.layout),
          managedCss: s.meta.managedCss,
          themeHref: themeUrl(s.meta.path, s.meta.theme, s.meta.themeHref),
          baseHref: `${location.origin}/files/${dir}`,
          extraStylesheets: extra,
          width: s.meta.config.width,
          height: s.meta.config.height,
          center: s.meta.config.center,
          margin: s.meta.config.margin,
          h: posRef.current?.h ?? 0,
          v: posRef.current?.v ?? 0,
        },
        '*',
      );
    }

    function schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(buildAndSend, 300);
    }

    let lastCss: unknown = null;
    const unsubscribe = useDeckStore.subscribe((state) => {
      if (
        state.columns !== lastColumns ||
        state.meta?.theme !== lastTheme ||
        state.meta?.managedCss !== lastCss
      ) {
        lastColumns = state.columns;
        lastTheme = state.meta?.theme;
        lastCss = state.meta?.managedCss;
        schedule();
      }
    });

    function onMessage(e: MessageEvent) {
      if (e.data?.type === 'harness-loaded') buildAndSend();
    }
    window.addEventListener('message', onMessage);

    return () => {
      unsubscribe();
      window.removeEventListener('message', onMessage);
      if (timer) clearTimeout(timer);
    };
  }, [open]);

  // Follow the selection.
  useEffect(() => {
    if (!open || !pos) return;
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'navigate', h: pos.h, v: pos.v },
      '*',
    );
  }, [open, pos?.h, pos?.v]);

  return (
    <div className={`preview-pane${open ? '' : ' collapsed'}`}>
      <Button
        variant="subtle"
        color="gray"
        size="compact-sm"
        radius={0}
        fullWidth
        rightSection={open ? <IconChevronRight size={14} /> : undefined}
        leftSection={open ? undefined : <IconChevronLeft size={14} />}
        onClick={() => setOpen(!open)}
      >
        {open ? 'Hide preview' : 'Preview'}
      </Button>
      {open && (
        <iframe ref={iframeRef} title="Live preview" src="/preview.html" className="preview-frame" />
      )}
    </div>
  );
}
