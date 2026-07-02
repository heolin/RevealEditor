import {
  IconArrowBackUp,
  IconArrowDown,
  IconArrowForwardUp,
  IconArrowUp,
  IconBoxMultiple,
  IconCopy,
  IconLayoutAlignBottom,
  IconLayoutAlignCenter,
  IconLayoutAlignLeft,
  IconLayoutAlignMiddle,
  IconLayoutAlignRight,
  IconLayoutAlignTop,
  IconLayoutDistributeHorizontal,
  IconLayoutDistributeVertical,
  IconLayoutGrid,
  IconPinnedOff,
  IconStackPop,
  IconStackPush,
  IconTrash,
} from '@tabler/icons-react';
import type { Action, EditorContext } from './types';
import {
  contentSibling,
  copyElement,
  cutElement,
  deleteElement,
  duplicateElement,
  hasClipboard,
  moveSibling,
  pasteElement,
} from '../commands';
import {
  type AlignEdge,
  alignElements,
  changeZOrder,
  distributeElements,
  groupElements,
  isGroupEl,
  returnToFlow,
  ungroupElements,
} from '../geometry';
import { useDeckStore } from '../../state/deckStore';
import { useEditorStore } from '../editorStore';

const hasSelection = (ctx: EditorContext) => !!ctx.stage && !!ctx.selection && !ctx.session;

function design(ctx: EditorContext): { width: number; height: number } {
  return ctx.deck?.config ?? { width: 960, height: 700 };
}

const ALIGN_DEFS: { edge: AlignEdge; title: string; icon: Action['icon'] }[] = [
  { edge: 'left', title: 'Align left edges', icon: IconLayoutAlignLeft },
  { edge: 'hcenter', title: 'Align horizontal centers', icon: IconLayoutAlignCenter },
  { edge: 'right', title: 'Align right edges', icon: IconLayoutAlignRight },
  { edge: 'top', title: 'Align top edges', icon: IconLayoutAlignTop },
  { edge: 'vcenter', title: 'Align vertical centers', icon: IconLayoutAlignMiddle },
  { edge: 'bottom', title: 'Align bottom edges', icon: IconLayoutAlignBottom },
];

export const arrangeActions: Action[] = [
  {
    id: 'arrange.duplicate',
    title: 'Duplicate',
    icon: IconCopy,
    kind: 'button',
    group: 'arrange',
    shortcut: 'mod+d',
    when: hasSelection,
    run: (ctx) => ctx.stage && ctx.selection && duplicateElement(ctx.stage, ctx.selection),
  },
  {
    id: 'arrange.copy',
    title: 'Copy',
    kind: 'button',
    group: 'arrange',
    shortcut: 'mod+c',
    when: hasSelection,
    run: (ctx) => ctx.selection && copyElement(ctx.selection),
  },
  {
    id: 'arrange.cut',
    title: 'Cut',
    kind: 'button',
    group: 'arrange',
    shortcut: 'mod+x',
    when: hasSelection,
    run: (ctx) => ctx.stage && ctx.selection && cutElement(ctx.stage, ctx.selection),
  },
  {
    id: 'arrange.paste',
    title: 'Paste',
    kind: 'button',
    group: 'arrange',
    shortcut: 'mod+v',
    when: (ctx) => !!ctx.stage && !ctx.session,
    enabled: () => hasClipboard(),
    run: (ctx) => ctx.stage && pasteElement(ctx.stage, ctx.selection),
  },
  {
    id: 'arrange.moveUp',
    title: 'Move up',
    icon: IconArrowUp,
    kind: 'button',
    group: 'arrange',
    // Only when a sibling exists to swap with — a lone element in its
    // container (a column, a cell, the slide) shows neither arrow.
    when: (ctx) => hasSelection(ctx) && !!ctx.selection && !!contentSibling(ctx.selection, 'up'),
    run: (ctx) => ctx.stage && ctx.selection && moveSibling(ctx.stage, ctx.selection, 'up'),
  },
  {
    id: 'arrange.moveDown',
    title: 'Move down',
    icon: IconArrowDown,
    kind: 'button',
    group: 'arrange',
    when: (ctx) => hasSelection(ctx) && !!ctx.selection && !!contentSibling(ctx.selection, 'down'),
    run: (ctx) => ctx.stage && ctx.selection && moveSibling(ctx.stage, ctx.selection, 'down'),
  },
  {
    id: 'arrange.front',
    title: 'Bring forward',
    icon: IconStackPop,
    kind: 'button',
    group: 'arrange',
    when: (ctx) => hasSelection(ctx) && ctx.isAbsolute,
    run: (ctx) => ctx.stage && ctx.selection && changeZOrder(ctx.stage, ctx.selection, 1),
  },
  {
    id: 'arrange.back',
    title: 'Send backward',
    icon: IconStackPush,
    kind: 'button',
    group: 'arrange',
    when: (ctx) => hasSelection(ctx) && ctx.isAbsolute,
    run: (ctx) => ctx.stage && ctx.selection && changeZOrder(ctx.stage, ctx.selection, -1),
  },
  {
    id: 'arrange.unpin',
    title: 'Back to layout (unpin)',
    icon: IconPinnedOff,
    kind: 'button',
    group: 'arrange',
    when: (ctx) => hasSelection(ctx) && ctx.isAbsolute,
    run: (ctx) => ctx.stage && ctx.selection && returnToFlow(ctx.stage, ctx.selection),
  },
  ...ALIGN_DEFS.map(
    ({ edge, title, icon }): Action => ({
      id: `arrange.align.${edge}`,
      title,
      icon,
      kind: 'button',
      group: 'arrange',
      when: hasSelection,
      run: (ctx) => ctx.stage && alignElements(ctx.stage, ctx.selections, edge, design(ctx)),
    }),
  ),
  {
    id: 'arrange.distributeH',
    title: 'Distribute horizontally',
    icon: IconLayoutDistributeHorizontal,
    kind: 'button',
    group: 'arrange',
    when: (ctx) => hasSelection(ctx) && ctx.selections.length >= 3,
    run: (ctx) => ctx.stage && distributeElements(ctx.stage, ctx.selections, 'h', design(ctx)),
  },
  {
    id: 'arrange.distributeV',
    title: 'Distribute vertically',
    icon: IconLayoutDistributeVertical,
    kind: 'button',
    group: 'arrange',
    when: (ctx) => hasSelection(ctx) && ctx.selections.length >= 3,
    run: (ctx) => ctx.stage && distributeElements(ctx.stage, ctx.selections, 'v', design(ctx)),
  },
  {
    id: 'arrange.group',
    title: 'Group',
    icon: IconBoxMultiple,
    kind: 'button',
    group: 'arrange',
    shortcut: 'mod+g',
    when: (ctx) => hasSelection(ctx) && ctx.selections.length >= 2,
    run: (ctx) => {
      if (!ctx.stage) return;
      const group = groupElements(ctx.stage, ctx.selections, design(ctx));
      if (group) useEditorStore.getState().select(group);
    },
  },
  {
    id: 'arrange.ungroup',
    title: 'Ungroup',
    kind: 'button',
    group: 'arrange',
    shortcut: 'mod+shift+g',
    when: (ctx) => hasSelection(ctx) && !!ctx.selection && isGroupEl(ctx.selection),
    run: (ctx) => {
      if (!ctx.stage || !ctx.selection) return;
      const children = ungroupElements(ctx.stage, ctx.selection);
      useEditorStore.getState().selectMany(children);
    },
  },
  {
    id: 'arrange.delete',
    title: 'Delete',
    icon: IconTrash,
    kind: 'button',
    group: 'arrange',
    shortcut: ['delete', 'backspace'],
    when: (ctx) => hasSelection(ctx) && (ctx.handler?.capabilities.delete ?? true),
    run: (ctx) => {
      if (!ctx.stage) return;
      // Delete the whole selection set (multi-select aware).
      for (const el of ctx.selections) deleteElement(ctx.stage, el);
    },
  },
];

export const viewActions: Action[] = [
  {
    id: 'view.layoutMode',
    title: 'Layout mode',
    icon: IconLayoutGrid,
    kind: 'toggle',
    group: 'view',
    shortcut: 'mod+l',
    when: (ctx) => !!ctx.stage,
    active: () => useEditorStore.getState().layoutMode,
    run: () => {
      const s = useEditorStore.getState();
      s.setLayoutMode(!s.layoutMode);
    },
  },
];

export const historyActions: Action[] = [
  {
    id: 'history.undo',
    title: 'Undo',
    icon: IconArrowBackUp,
    kind: 'button',
    group: 'history',
    shortcut: 'mod+z',
    worksInSession: true,
    when: (ctx) => !!ctx.deck,
    run: () => useDeckStore.temporal.getState().undo(),
  },
  {
    id: 'history.redo',
    title: 'Redo',
    icon: IconArrowForwardUp,
    kind: 'button',
    group: 'history',
    shortcut: ['mod+shift+z', 'mod+y'],
    worksInSession: true,
    when: (ctx) => !!ctx.deck,
    run: () => useDeckStore.temporal.getState().redo(),
  },
  {
    id: 'file.save',
    title: 'Save',
    kind: 'button',
    group: 'file',
    shortcut: 'mod+s',
    worksInSession: true,
    when: (ctx) => !!ctx.deck,
    enabled: () => useDeckStore.getState().dirty,
    run: () => void useDeckStore.getState().save(),
  },
];
