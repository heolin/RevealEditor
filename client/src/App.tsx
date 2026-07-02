import { useEffect } from 'react';
import { useDeckStore } from './state/deckStore';
import { useEditorStore } from './editor/editorStore';
import { dispatchShortcut } from './editor/actions/dispatcher';
import { applyLayoutOverrides } from './editor/actions/layouts';
import { api } from './api/client';
import { DeckList } from './components/DeckList';
import { Toolbar } from './components/Toolbar';
import { SorterPanel } from './components/Sorter/SorterPanel';
import { SlideCanvas } from './components/Canvas/SlideCanvas';
import { PreviewPane } from './components/Preview/PreviewPane';
import { ConflictDialog } from './components/ConflictDialog';
import { Tabs } from '@mantine/core';
import { InspectorPanel } from './components/Inspector/InspectorPanel';
import { LayersPanel } from './components/Inspector/LayersPanel';
import { NotesDrawer } from './components/Notes/NotesDrawer';
import { CodeModal } from './editor/CodeModal';
import { ChartModal } from './editor/chart/ChartModal';
import { ComponentPalette } from './components/Palette/ComponentPalette';

export function App() {
  const meta = useDeckStore((s) => s.meta);
  const conflict = useDeckStore((s) => s.conflict);

  // A session that survived a toolbar interaction (ignoreBlur) has no second
  // blur to end it — parent clicks OUTSIDE editor chrome close it explicitly.
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      const editor = useEditorStore.getState();
      if (!editor.sessionEl) return;
      const target = e.target as HTMLElement;
      if (
        target.closest?.(
          '.toolbar, .mantine-Popover-dropdown, [data-combobox-dropdown], .mantine-Menu-dropdown, .mantine-Modal-root',
        )
      ) {
        return;
      }
      editor.endSession(true);
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  // Toolbar layout overrides from .revealeditor.json (docs/TOOLBARS.md P4).
  useEffect(() => {
    api
      .editorConfig()
      .then((config) => {
        applyLayoutOverrides(config);
        useEditorStore.getState().bump();
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const state = useDeckStore.getState();
      if (!state.meta) return;
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable]')) return;
      // Commands first (element delete, clipboard, undo/save, formatting).
      if (dispatchShortcut(e, false)) {
        e.preventDefault();
        return;
      }
      // No element selected: Delete falls through to the slide itself.
      if (e.key === 'Delete' && state.selectedSlideId && !useEditorStore.getState().selectedEl) {
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
          <Tabs defaultValue="design" className="right-tabs">
            <Tabs.List>
              <Tabs.Tab value="design">Design</Tabs.Tab>
              <Tabs.Tab value="layers">Layers</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="design" className="right-tab-panel">
              <InspectorPanel />
            </Tabs.Panel>
            <Tabs.Panel value="layers" className="right-tab-panel">
              <LayersPanel />
            </Tabs.Panel>
          </Tabs>
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
