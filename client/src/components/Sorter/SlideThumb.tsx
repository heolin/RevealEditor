import { useMemo } from 'react';
import { slideElement } from '../../model/deck';
import { themeColors } from '../../model/themeColors';
import { useDeckStore } from '../../state/deckStore';

/**
 * Cheap static thumbnail: the slide's markup scaled way down, colored to
 * roughly match the deck theme. Theme-faithful rendering lives in the
 * canvas; thumbnails only need to be recognizable.
 */
export function SlideThumb({ source }: { source: string }) {
  const theme = useDeckStore((s) => s.meta?.theme ?? null);
  const colors = themeColors(theme);

  const { html, bg } = useMemo(() => {
    const el = slideElement(source);
    if (!el) return { html: '', bg: undefined as string | undefined };
    el.querySelectorAll('aside.notes').forEach((n) => n.remove());
    return {
      html: el.innerHTML,
      bg:
        el.getAttribute('data-background-color') ??
        el.getAttribute('data-background') ??
        undefined,
    };
  }, [source]);

  return (
    <div className="slide-thumb" style={{ background: bg ?? colors.bg }}>
      <div
        className="slide-thumb-content"
        style={{ color: colors.text }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
