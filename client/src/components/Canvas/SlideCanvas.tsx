import { useEffect, useRef, useState } from 'react';
import { Button } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useDeckStore } from '../../state/deckStore';
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

  return (
    <div className="canvas-pane" ref={paneRef}>
      <LayoutPanel />
      <div className="canvas-stage" style={{ width: width * scale, height: height * scale }}>
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
