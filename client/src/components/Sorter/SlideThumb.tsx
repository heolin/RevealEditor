import { useEffect, useMemo, useRef, useState } from 'react';
import { useDeckStore } from '../../state/deckStore';
import { thumbDoc } from '../../editor/stageDoc';

/**
 * Theme-faithful miniature: the slide rendered in the same document shell as
 * the canvas (reveal.css + theme + the deck's own styles), scaled way down in
 * an inert iframe. Stylesheets are HTTP-cached, so N thumbnails share the
 * network cost of one.
 */
export function SlideThumb({ source }: { source: string }) {
  const meta = useDeckStore((s) => s.meta);
  const hostRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(() => setWidth(host.clientWidth));
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const srcDoc = useMemo(
    () => (meta ? thumbDoc(meta, source) : ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source, meta?.path, meta?.theme, meta?.themeHref, meta?.stylesheets, meta?.headStyles, meta?.managedCss],
  );

  if (!meta) return null;
  const { width: designW, height: designH } = meta.config;
  const scale = width > 0 ? width / designW : 0;

  return (
    <div
      ref={hostRef}
      className="slide-thumb"
      style={{ aspectRatio: `${designW} / ${designH}` }}
    >
      {scale > 0 && (
        <iframe
          title="Slide thumbnail"
          srcDoc={srcDoc}
          tabIndex={-1}
          loading="lazy"
          style={{
            width: designW,
            height: designH,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            border: 'none',
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  );
}
