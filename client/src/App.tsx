import { useEffect } from 'react';
import { useDeckStore } from './state/deckStore';
import { useEditorStore } from './editor/editorStore';
import { deleteElement } from './editor/commands';
import { api } from './api/client';
import { DeckList } from './components/DeckList';
import { Toolbar } from './components/Toolbar';
import { SorterPanel } from './components/Sorter/SorterPanel';
import { SlideCanvas } from './components/Canvas/SlideCanvas';
import { PreviewPane } from './components/Preview/PreviewPane';
import { ConflictDialog } from './components/ConflictDialog';
import { InspectorPanel } from './components/Inspector/InspectorPanel';
import { NotesDrawer } from './components/Notes/NotesDrawer';
import { CodeModal } from './editor/CodeModal';
import { ChartModal } from './editor/chart/ChartModal';
import { ComponentPalette } from './components/Palette/ComponentPalette';

export function App() {
  const meta = useDeckStore((s) => s.meta);
  const conflict = useDeckStore((s) => s.conflict);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const state = useDeckStore.getState();
      if (!state.meta) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void state.save();
      } else if (mod && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        useDeckStore.temporal.getState().undo();
      } else if (
        (mod && e.shiftKey && e.key.toLowerCase() === 'z') ||
        (mod && e.key.toLowerCase() === 'y')
      ) {
        e.preventDefault();
        useDeckStore.temporal.getState().redo();
      } else if (e.key === 'Delete' && state.selectedSlideId) {
        const target = e.target as HTMLElement;
        if (target.closest('input, textarea, [contenteditable]')) return;
        // An element selection on the canvas takes precedence over the slide.
        const editor = useEditorStore.getState();
        if (editor.selectedEl && editor.ctx) {
          e.preventDefault();
          deleteElement(editor.ctx, editor.selectedEl);
          return;
        }
        e.preventDefault();
        state.deleteSlide(state.selectedSlideId);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (!meta) return <DeckList />;

  return (
    <div className="editor-layout">
      <Toolbar />
      <div className="editor-body">
        <SorterPanel />
        <div className="center-col">
          <SlideCanvas />
          <NotesDrawer />
        </div>
        <div className="right-col">
          <InspectorPanel />
          <PreviewPane />
        </div>
      </div>
      <CodeModal />
      <ChartModal />
      <ComponentPalette />
      {conflict && <ConflictDialog />}
    </div>
  );
}

export async function openDeck(path: string) {
  const deck = await api.getDeck(path);
  useDeckStore.getState().load(deck);
}
