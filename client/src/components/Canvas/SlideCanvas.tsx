import { useEffect, useRef, useState } from 'react';
import { Button } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useDeckStore } from '../../state/deckStore';
import { useEditorStore } from '../../editor/editorStore';
import { marqueeHits } from '../../editor/geometry';
import { StageFrame } from '../../editor/StageFrame';
import { EditorOverlay } from '../../editor/overlay/EditorOverlay';
import { LayoutPanel } from './LayoutPanel';

/** The canvas pane: scales the editing stage to fit and hosts the overlay. */
export function SlideCanvas() {
  const meta = useDeckStore((s) => s.meta)!;
  const slide = useDeckStore((s) => {
    for (const col of s.columns) {
      const found = col.slides.find((sl) => sl.id === s.selectedSlideId);
      if (found) return found;
    }
    return null;
  });

  const paneRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const { width, height } = meta.config;

  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;
    const observer = new ResizeObserver(() => {
      const rect = pane.getBoundingClientRect();
      setScale(Math.min((rect.width - 48) / width, (rect.height - 88) / height));
    });
    observer.observe(pane);
    return () => observer.disconnect();
  }, [width, height]);

  if (!slide) {
    return (
      <div className="canvas-pane" ref={paneRef}>
        <div className="canvas-empty">
          <p>No slide selected.</p>
          <Button
            variant="light"
            leftSection={<IconPlus size={16} />}
            onClick={() => useDeckStore.getState().addSlideAtEnd()}
          >
            Add a slide
          </Button>
        </div>
      </div>
    );
  }

  /** Marquee can start from the canvas BACKGROUND, not just inside the slide. */
  function onPanePointerDown(e: React.PointerEvent) {
    if (e.button !== 0 || e.target !== paneRef.current) return;
    const ctx = useEditorStore.getState().ctx;
    const stageEl = stageRef.current;
    if (!ctx || !stageEl) return;
    const sr = stageEl.getBoundingClientRect();
    const toSlide = (cx: number, cy: number) => ({
      x: (cx - sr.left) / scale,
      y: (cy - sr.top) / scale,
    });
    const start = toSlide(e.clientX, e.clientY);
    let moved = false;
    const pane = e.target as HTMLElement;
    pane.setPointerCapture(e.pointerId);

    function onMove(ev: PointerEvent) {
      const cur = toSlide(ev.clientX, ev.clientY);
      const rect = {
        x: Math.min(start.x, cur.x),
        y: Math.min(start.y, cur.y),
        w: Math.abs(cur.x - start.x),
        h: Math.abs(cur.y - start.y),
      };
      if (!moved && Math.hypot(rect.w, rect.h) * scale < 4) return;
      moved = true;
      useEditorStore.getState().setMarquee(rect);
      useEditorStore.getState().selectMany(marqueeHits(ctx!, rect));
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      useEditorStore.getState().setMarquee(null);
      if (!moved) useEditorStore.getState().select(null);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  return (
    <div className="canvas-pane" ref={paneRef} onPointerDown={onPanePointerDown}>
      <LayoutPanel />
      <div
        ref={stageRef}
        className="canvas-stage"
        style={{ width: width * scale, height: height * scale }}
      >
        <div
          style={{
            width,
            height,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          <StageFrame slide={slide} meta={meta} />
        </div>
        <EditorOverlay scale={scale} />
      </div>
    </div>
  );
}
