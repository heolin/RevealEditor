import { useMemo } from 'react';
import { slideElement } from '../../model/deck';

/**
 * Cheap static thumbnail: the slide's markup scaled way down with generic
 * dark styling. Theme-faithful rendering lives in the canvas; thumbnails
 * only need to be recognizable.
 */
export function SlideThumb({ source }: { source: string }) {
  const { html, bg } = useMemo(() => {
    const el = slideElement(source);
    if (!el) return { html: '', bg: undefined as string | undefined };
    el.querySelectorAll('aside.notes').forEach((n) => n.remove());
    return {
      html: el.innerHTML,
      bg: el.getAttribute('data-background-color') ?? undefined,
    };
  }, [source]);

  return (
    <div className="slide-thumb" style={bg ? { background: bg } : undefined}>
      <div className="slide-thumb-content" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
