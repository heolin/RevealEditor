import { useMemo } from 'react';
import { useEditorStore } from '../editorStore';
import { useDeckStore } from '../../state/deckStore';
import { handlerFor } from '../registry';
import { isAbsolute } from '../geometry';
import type { EditorContext } from './types';

/** Build the context snapshot — the ONLY place that inspects selection state. */
export function buildEditorContext(): EditorContext {
  const e = useEditorStore.getState();
  const d = useDeckStore.getState();
  const selection = e.selectedEl?.isConnected ? e.selectedEl : null;
  const selections = [...e.extraSelected, e.selectedEl].filter(
    (el): el is HTMLElement => !!el && el.isConnected,
  );
  const slide =
    d.columns.flatMap((c) => c.slides).find((s) => s.id === d.selectedSlideId) ?? null;
  return {
    stage: e.ctx,
    selection,
    selections,
    handler: selection ? handlerFor(selection) : null,
    session: e.sessionEl ? 'text' : e.codeEditEl ? 'code' : e.chartEditEl ? 'chart' : null,
    isAbsolute: selection ? isAbsolute(selection) : false,
    cell: (selection?.closest('td, th') as HTMLTableCellElement | null) ?? null,
    slide,
    deck: d.meta,
  };
}

/** Reactive context for surfaces — recomputed on any editor mutation. */
export function useEditorContext(): EditorContext {
  const docVersion = useEditorStore((s) => s.docVersion);
  const selectedSlideId = useDeckStore((s) => s.selectedSlideId);
  const meta = useDeckStore((s) => s.meta);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(buildEditorContext, [docVersion, selectedSlideId, meta]);
}
