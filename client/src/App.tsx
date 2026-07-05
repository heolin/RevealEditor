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
import { ImagePanel } from './components/Inspector/ImagePanel';
import { EffectsPanel } from './components/Inspector/EffectsPanel';
import { TablePanel } from './components/Inspector/TablePanel';
import { NotesDrawer } from './components/Notes/NotesDrawer';
import { CodeModal } from './editor/CodeModal';
import { ChartModal } from './editor/chart/ChartModal';
import { ComponentPalette } from './components/Palette/ComponentPalette';
import { IconPicker } from './components/IconPicker';

export function App() {
  const meta = useDeckStore((s) => s.meta);
  const conflict = useDeckStore((s) => s.conflict);
  const selectedEl = useEditorStore((s) => s.selectedEl);
  const rightTab = useEditorStore((s) => s.rightTab);
  const maskEl = useEditorStore((s) => s.maskEl);
  const hasSelection = !!selectedEl && selectedEl.isConnected;
  const isImage = hasSelection && selectedEl.tagName === 'IMG';
  const isTable = hasSelection && !!selectedEl.closest('table');

  // Image/Effects are contextual tabs. Image exists only for images; Effects
  // for any selection. Losing the relevant selection falls back to Design;
  // changing selection while in mask mode retargets (image) or exits.
  useEffect(() => {
    const s = useEditorStore.getState();
    if (!isImage && rightTab === 'image') {
      s.setRightTab('design');
      s.setMaskEl(null);
    } else if (maskEl && maskEl !== selectedEl) {
      s.setMaskEl(isImage ? selectedEl : null);
    }
    if (!hasSelection && rightTab === 'effects') s.setRightTab('design');
    if (!isTable && rightTab === 'table') s.setRightTab('design');
  }, [isImage, isTable, hasSelection, rightTab, selectedEl, maskEl]);

  // A session that survived a toolbar interaction (ignoreBlur) has no second
  // blur to end it — parent clicks OUTSIDE editor chrome close it explicitly.
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      // Synthetic mousedowns forwarded from the stage iframe (to close open
      // popovers) are NOT outside clicks — the stage manages its own session
      // lifecycle for clicks on the canvas.
      if ((e as MouseEvent & { reFromStage?: boolean }).reFromStage) return;
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
          <Tabs
            value={rightTab}
            onChange={(v) => {
              const tab = (v ?? 'design') as 'design' | 'layers' | 'image' | 'effects';
              useEditorStore.getState().setRightTab(tab);
              // Opening the Image tab enters mask mode; leaving it exits.
              useEditorStore
                .getState()
                .setMaskEl(tab === 'image' && isImage ? selectedEl : null);
            }}
            className="right-tabs"
          >
            <Tabs.List>
              <Tabs.Tab value="design">Design</Tabs.Tab>
              <Tabs.Tab value="layers">Layers</Tabs.Tab>
              {isImage && <Tabs.Tab value="image">Image</Tabs.Tab>}
              {isTable && <Tabs.Tab value="table">Table</Tabs.Tab>}
              {hasSelection && <Tabs.Tab value="effects">Effects</Tabs.Tab>}
            </Tabs.List>
            <Tabs.Panel value="design" className="right-tab-panel">
              <InspectorPanel />
            </Tabs.Panel>
            <Tabs.Panel value="layers" className="right-tab-panel">
              <LayersPanel />
            </Tabs.Panel>
            <Tabs.Panel value="image" className="right-tab-panel">
              <ImagePanel />
            </Tabs.Panel>
            <Tabs.Panel value="table" className="right-tab-panel">
              <TablePanel />
            </Tabs.Panel>
            <Tabs.Panel value="effects" className="right-tab-panel">
              <EffectsPanel />
            </Tabs.Panel>
          </Tabs>
          <PreviewPane />
        </div>
      </div>
      <CodeModal />
      <ChartModal />
      <ComponentPalette />
      <IconPicker />
      {conflict && <ConflictDialog />}
    </div>
  );
}

export async function openDeck(path: string) {
  const deck = await api.getDeck(path);
  useDeckStore.getState().load(deck);
}
