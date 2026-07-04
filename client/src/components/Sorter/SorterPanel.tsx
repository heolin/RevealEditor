import { useEffect, useMemo, useRef, useState } from 'react';
import { ActionIcon, CloseButton, TextInput, Tooltip } from '@mantine/core';
import {
  IconArrowDown,
  IconArrowRight,
  IconClipboard,
  IconClipboardPlus,
  IconCopy,
  IconEyeOff,
  IconPlus,
  IconSearch,
  IconTrash,
  IconWand,
} from '@tabler/icons-react';
import {
  DndContext,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useDeckStore } from '../../state/deckStore';
import type { Column, Slide } from '../../model/deck';
import { SlideThumb } from './SlideThumb';

/**
 * The 2-D sorter. The sidebar lists columns top-to-bottom (= reveal's
 * horizontal axis); a column with several slides is a vertical stack.
 *
 * Drag model (plain draggable/droppable — no sortable animations):
 *  - drag a slide onto a slot  → insert at that position in that column
 *  - drag a slide onto a gap   → becomes its own new column there
 *  - drag a column (≡ handle) onto a gap → reorder columns
 */

/**
 * Pointer-driven hit testing. The default rectIntersection compares the whole
 * dragged thumbnail against the drop strips, and the full-width column gaps
 * beat the thin in-column slots on area — making it impossible to drop a
 * slide *into* a stack. Instead: exact pointer hit first, then the strip
 * nearest to the pointer, bounded so a drag released far from the sorter
 * still cancels. Column drags only ever target gaps.
 */
const SNAP_RANGE = 64;

const collideWithStrips: CollisionDetection = (args) => {
  const containers = String(args.active.id).startsWith('col:')
    ? args.droppableContainers.filter((c) => String(c.id).startsWith('gap:'))
    : args.droppableContainers;

  const hit = pointerWithin({ ...args, droppableContainers: containers });
  if (hit.length > 0) return hit;

  const pointer = args.pointerCoordinates;
  if (!pointer) return [];
  let best: { id: string | number; d: number } | null = null;
  for (const c of containers) {
    const rect = args.droppableRects.get(c.id);
    if (!rect) continue;
    const dx = Math.max(rect.left - pointer.x, 0, pointer.x - rect.right);
    const dy = Math.max(rect.top - pointer.y, 0, pointer.y - rect.bottom);
    const d = Math.hypot(dx, dy);
    if (d < (best?.d ?? Infinity)) best = { id: c.id, d };
  }
  return best && best.d <= SNAP_RANGE ? [{ id: best.id }] : [];
};

export function SorterPanel() {
  const columns = useDeckStore((s) => s.columns);
  const [dragging, setDragging] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // Jump-to-slide search: match against the slides' text content.
  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return new Set<string>();
    const ids = new Set<string>();
    for (const col of columns) {
      for (const slide of col.slides) {
        const text = slide.source.replace(/<[^>]+>/g, ' ').toLowerCase();
        if (text.includes(q)) ids.add(slide.id);
      }
    }
    return ids;
  }, [columns, query]);

  function jumpToNextHit() {
    const store = useDeckStore.getState();
    const ordered = store.columns.flatMap((c) => c.slides.map((sl) => sl.id));
    const matching = ordered.filter((id) => hits.has(id));
    if (matching.length === 0) return;
    const current = matching.indexOf(store.selectedSlideId ?? '');
    store.select(matching[(current + 1) % matching.length]);
  }

  function onDragStart(e: DragStartEvent) {
    setDragging(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    const activeId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId) return;
    const store = useDeckStore.getState();

    if (activeId.startsWith('col:')) {
      if (overId.startsWith('gap:')) {
        store.moveColumn(activeId.slice(4), parseInt(overId.slice(4), 10));
      }
    } else if (activeId.startsWith('slide:')) {
      const slideId = activeId.slice(6);
      if (overId.startsWith('gap:')) {
        store.moveSlideToGap(slideId, parseInt(overId.slice(4), 10));
      } else if (overId.startsWith('slot:')) {
        const [, colId, idx] = overId.split(':');
        store.moveSlideToSlot(slideId, colId, parseInt(idx, 10));
      }
    }
  }

  return (
    <div className="sorter">
      <TextInput
        size="xs"
        mb={6}
        placeholder="Find slide…"
        aria-label="Find slide"
        leftSection={<IconSearch size={13} />}
        rightSection={
          query ? (
            <CloseButton size="xs" aria-label="Clear search" onClick={() => setQuery('')} />
          ) : null
        }
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') jumpToNextHit();
        }}
      />
      <DndContext
        sensors={sensors}
        collisionDetection={collideWithStrips}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <ColumnGap index={0} active={!!dragging} />
        {columns.map((col, i) => (
          <div key={col.id}>
            <SorterColumn column={col} colIndex={i} dragging={dragging} hits={hits} />
            <ColumnGap index={i + 1} active={!!dragging} />
          </div>
        ))}
      </DndContext>
      <button
        type="button"
        className="sorter-add-slide"
        title="Add slide at the end"
        onClick={() => useDeckStore.getState().addSlideAtEnd()}
      >
        <IconPlus size={22} />
      </button>
      <button
        type="button"
        className="sorter-add-slide sorter-paste-slide"
        title="Paste slide from clipboard (works across decks)"
        onClick={() =>
          void navigator.clipboard
            .readText()
            .then((t) => useDeckStore.getState().addSlideFromSource(t))
            .catch(() => undefined)
        }
      >
        <IconClipboardPlus size={18} />
      </button>
      {columns.length === 0 && (
        <div className="sorter-empty">
          <p>Deck is empty.</p>
        </div>
      )}
    </div>
  );
}

function SorterColumn({
  column,
  colIndex,
  dragging,
  hits,
}: {
  column: Column;
  colIndex: number;
  dragging: string | null;
  hits: Set<string>;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `col:${column.id}`,
  });
  const slideDragActive = !!dragging && dragging.startsWith('slide:');

  return (
    <div ref={setNodeRef} className={`sorter-column${isDragging ? ' drag-source' : ''}`}>
      <div className="column-header">
        <span className="drag-handle" {...listeners} {...attributes} title="Drag to reorder">
          ≡
        </span>
        <span className="column-index">{colIndex + 1}</span>
        {column.isStack && <span className="stack-badge">{column.slides.length} stacked</span>}
      </div>
      {slideDragActive && <SlideSlot columnId={column.id} index={0} />}
      {column.slides.map((slide, v) => (
        <div key={slide.id}>
          <SorterSlide
            slide={slide}
            inStack={column.isStack}
            hit={hits.has(slide.id)}
            indexLabel={column.isStack ? `${colIndex + 1}.${v + 1}` : ''}
          />
          {slideDragActive && <SlideSlot columnId={column.id} index={v + 1} />}
        </div>
      ))}
    </div>
  );
}

function SorterSlide({
  slide,
  inStack,
  hit,
  indexLabel,
}: {
  slide: Slide;
  inStack: boolean;
  hit: boolean;
  indexLabel: string;
}) {
  const selected = useDeckStore((s) => s.selectedSlideId === slide.id);
  const select = useDeckStore((s) => s.select);
  const store = useDeckStore;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `slide:${slide.id}`,
  });
  const nodeRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    // Search jumps (and any selection) keep the thumb in view.
    if (selected) nodeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  return (
    <div
      ref={(el) => {
        setNodeRef(el);
        nodeRef.current = el;
      }}
      className={[
        'sorter-slide',
        inStack ? 'in-stack' : '',
        selected ? 'selected' : '',
        hit ? 'search-hit' : '',
        isDragging ? 'drag-source' : '',
      ].join(' ')}
      onClick={() => select(slide.id)}
      {...listeners}
      {...attributes}
    >
      {indexLabel && <span className="slide-sub-index">{indexLabel}</span>}
      {/^<section[^>]*data-visibility=["']?hidden/.test(slide.source) && (
        <span className="hidden-badge" title="Hidden slide (skipped when presenting)">
          <IconEyeOff size={11} />
        </span>
      )}
      <SlideThumb source={slide.source} />
      <div className="slide-actions" onPointerDown={(e) => e.stopPropagation()}>
        <Tooltip label="Add slide after">
          <ActionIcon
            size="sm"
            variant="default"
            onClick={(e) => {
              e.stopPropagation();
              const col = store
                .getState()
                .columns.find((c) => c.slides.some((s) => s.id === slide.id));
              if (col) store.getState().addSlideAfterColumn(col.id);
            }}
          >
            <IconArrowRight size={13} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Add below (vertical stack)">
          <ActionIcon
            size="sm"
            variant="default"
            onClick={(e) => {
              e.stopPropagation();
              store.getState().addSlideBelow(slide.id);
            }}
          >
            <IconArrowDown size={13} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Copy slide (paste into any deck)">
          <ActionIcon
            size="sm"
            variant="default"
            onClick={(e) => {
              e.stopPropagation();
              void navigator.clipboard.writeText(slide.source).catch(() => undefined);
            }}
          >
            <IconClipboard size={13} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Duplicate">
          <ActionIcon
            size="sm"
            variant="default"
            onClick={(e) => {
              e.stopPropagation();
              store.getState().duplicateSlide(slide.id);
            }}
          >
            <IconCopy size={13} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Duplicate for auto-animate step">
          <ActionIcon
            size="sm"
            variant="default"
            onClick={(e) => {
              e.stopPropagation();
              store.getState().duplicateSlideForAutoAnimate(slide.id);
            }}
          >
            <IconWand size={13} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Delete">
          <ActionIcon
            size="sm"
            variant="default"
            color="red"
            onClick={(e) => {
              e.stopPropagation();
              store.getState().deleteSlide(slide.id);
            }}
          >
            <IconTrash size={13} />
          </ActionIcon>
        </Tooltip>
      </div>
    </div>
  );
}

function ColumnGap({ index, active }: { index: number; active: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `gap:${index}` });
  return (
    <div
      ref={setNodeRef}
      className={`column-gap${active ? ' active' : ''}${isOver ? ' over' : ''}`}
    />
  );
}

function SlideSlot({ columnId, index }: { columnId: string; index: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot:${columnId}:${index}` });
  return <div ref={setNodeRef} className={`slide-slot${isOver ? ' over' : ''}`} />;
}
