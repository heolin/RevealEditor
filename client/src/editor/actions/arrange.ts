import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconCopy,
  IconPinnedOff,
  IconStackPop,
  IconStackPush,
  IconTrash,
} from '@tabler/icons-react';
import type { Action, EditorContext } from './types';
import { copyElement, cutElement, deleteElement, duplicateElement, pasteElement, hasClipboard } from '../commands';
import { changeZOrder, returnToFlow } from '../geometry';
import { useDeckStore } from '../../state/deckStore';

const hasSelection = (ctx: EditorContext) => !!ctx.stage && !!ctx.selection && !ctx.session;

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
  {
    id: 'arrange.delete',
    title: 'Delete',
    icon: IconTrash,
    kind: 'button',
    group: 'arrange',
    shortcut: ['delete', 'backspace'],
    when: (ctx) => hasSelection(ctx) && (ctx.handler?.capabilities.delete ?? true),
    run: (ctx) => ctx.stage && ctx.selection && deleteElement(ctx.stage, ctx.selection),
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
