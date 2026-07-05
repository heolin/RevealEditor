/**
 * Image quick actions on the floating toolbar / context menu: enter the visual
 * mask editor or crop mode. The full picker lives in the "Image" inspector tab.
 */
import { IconCircleDashed, IconCrop } from '@tabler/icons-react';
import type { Action, EditorContext } from './types';
import { ensureCropBox } from '../crop';
import { useEditorStore } from '../editorStore';

const onImage = (ctx: EditorContext) =>
  !!ctx.stage && ctx.handler?.type === 'image' && !!ctx.selection && !ctx.session;

export const imageActions: Action[] = [
  {
    id: 'image.editMask',
    title: 'Edit mask',
    icon: IconCircleDashed,
    kind: 'button',
    group: 'format',
    when: onImage,
    run: (ctx) => {
      if (!ctx.selection) return;
      const store = useEditorStore.getState();
      store.setRightTab('image');
      store.setMaskEl(ctx.selection);
    },
  },
  {
    id: 'image.crop',
    title: 'Crop',
    icon: IconCrop,
    kind: 'button',
    group: 'format',
    when: onImage,
    run: (ctx) => {
      if (!ctx.stage || !ctx.selection) return;
      ensureCropBox(ctx.stage, ctx.selection as HTMLImageElement);
      useEditorStore.getState().setCropEl(ctx.selection);
    },
  },
];
