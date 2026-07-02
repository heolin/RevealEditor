import { useState } from 'react';
import { ActionIcon, Tooltip } from '@mantine/core';
import {
  IconArrowDown,
  IconArrowRight,
  IconCopy,
  IconEyeOff,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
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
export function SorterPanel() {
  const columns = useDeckStore((s) => s.columns);
  const [dragging, setDragging] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

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
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <ColumnGap index={0} active={!!dragging} />
        {columns.map((col, i) => (
          <div key={col.id}>
            <SorterColumn column={col} colIndex={i} dragging={dragging} />
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
}: {
  column: Column;
  colIndex: number;
  dragging: string | null;
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
          <SorterSlide slide={slide} inStack={column.isStack} indexLabel={
            column.isStack ? `${colIndex + 1}.${v + 1}` : ''
          } />
          {slideDragActive && <SlideSlot columnId={column.id} index={v + 1} />}
        </div>
      ))}
    </div>
  );
}

function SorterSlide({
  slide,
  inStack,
  indexLabel,
}: {
  slide: Slide;
  inStack: boolean;
  indexLabel: string;
}) {
  const selected = useDeckStore((s) => s.selectedSlideId === slide.id);
  const select = useDeckStore((s) => s.select);
  const store = useDeckStore;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `slide:${slide.id}`,
  });

  return (
    <div
      ref={setNodeRef}
      className={[
        'sorter-slide',
        inStack ? 'in-stack' : '',
        selected ? 'selected' : '',
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
