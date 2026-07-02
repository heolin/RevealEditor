import {
  IconAlignCenter,
  IconAlignLeft,
  IconAlignRight,
  IconBold,
  IconItalic,
  IconList,
  IconListNumbers,
  IconStrikethrough,
} from '@tabler/icons-react';
import type { Action, EditorContext } from './types';
import { convertListToParagraphs, convertToList, execInline, insertList, renameElement, commit } from '../commands';
import { applyStyle } from '../geometry';
import { useEditorStore } from '../editorStore';
import { fontOptions, FONT_SIZES } from './fonts';
import { LinkControl } from './customControls';

const inTextSession = (ctx: EditorContext) => ctx.session === 'text' && !!ctx.stage;

/** Element that block-level format ops apply to (session host or selection). */
function formatTarget(ctx: EditorContext): HTMLElement | null {
  return ctx.selection;
}

const stylable = (ctx: EditorContext) =>
  !!ctx.stage &&
  !!ctx.selection &&
  ['text', 'table', 'generic'].includes(ctx.handler?.type ?? '');

function styleValue(ctx: EditorContext, prop: string): string {
  return formatTarget(ctx)?.style.getPropertyValue(prop) ?? '';
}

function setStyle(ctx: EditorContext, prop: string, value: string | undefined): void {
  const el = formatTarget(ctx);
  if (!el || !ctx.stage) return;
  applyStyle(el, { [prop]: value || null });
  commit(ctx.stage);
}

const HEADING_OPTIONS = [
  { value: 'H1', label: 'H1' },
  { value: 'H2', label: 'H2' },
  { value: 'H3', label: 'H3' },
  { value: 'H4', label: 'H4' },
  { value: 'P', label: 'Text' },
];

export const formatActions: Action[] = [
  {
    id: 'format.bold',
    title: 'Bold',
    icon: IconBold,
    kind: 'toggle',
    group: 'format',
    shortcut: 'mod+b',
    worksInSession: true,
    when: inTextSession,
    active: (ctx) => !!ctx.stage && ctx.stage.doc.queryCommandState('bold'),
    run: (ctx) => ctx.stage && execInline(ctx.stage, 'bold'),
  },
  {
    id: 'format.italic',
    title: 'Italic',
    icon: IconItalic,
    kind: 'toggle',
    group: 'format',
    shortcut: 'mod+i',
    worksInSession: true,
    when: inTextSession,
    active: (ctx) => !!ctx.stage && ctx.stage.doc.queryCommandState('italic'),
    run: (ctx) => ctx.stage && execInline(ctx.stage, 'italic'),
  },
  {
    id: 'format.strike',
    title: 'Strikethrough',
    icon: IconStrikethrough,
    kind: 'toggle',
    group: 'format',
    when: inTextSession,
    active: (ctx) => !!ctx.stage && ctx.stage.doc.queryCommandState('strikeThrough'),
    run: (ctx) => ctx.stage && execInline(ctx.stage, 'strikeThrough'),
  },
  {
    id: 'format.link',
    title: 'Link',
    kind: 'custom',
    group: 'format',
    when: inTextSession,
    run: () => undefined, // handled by the custom control
    render: LinkControl,
  },
  {
    id: 'format.bulletList',
    title: 'Bullet list',
    icon: IconList,
    kind: 'button',
    group: 'format',
    when: (ctx) =>
      inTextSession(ctx) || (!!ctx.selection && ['P', 'UL', 'OL'].includes(ctx.selection.tagName)),
    run: (ctx) => {
      if (!ctx.stage || !ctx.selection) return;
      if (ctx.session === 'text') insertList(ctx.stage, false);
      else if (ctx.selection.tagName === 'P') convertToList(ctx.stage, ctx.selection, false);
      else if (['UL', 'OL'].includes(ctx.selection.tagName)) {
        const first = convertListToParagraphs(ctx.stage, ctx.selection);
        if (first) useEditorStore.getState().select(first);
      }
    },
  },
  {
    id: 'format.numberedList',
    title: 'Numbered list',
    icon: IconListNumbers,
    kind: 'button',
    group: 'format',
    when: inTextSession,
    run: (ctx) => ctx.stage && insertList(ctx.stage, true),
  },
  {
    id: 'format.heading',
    title: 'Text style',
    kind: 'select',
    group: 'format',
    width: 78,
    when: (ctx) =>
      !!ctx.stage &&
      !!ctx.selection &&
      (HEADING_OPTIONS.some((o) => o.value === ctx.selection!.tagName) ||
        ['H5', 'H6'].includes(ctx.selection.tagName)),
    value: (ctx) => ctx.selection?.tagName ?? null,
    options: () => HEADING_OPTIONS,
    run: (ctx, value) => {
      if (!ctx.stage || !ctx.selection || !value) return;
      const wasEditing = ctx.session === 'text';
      const repl = renameElement(ctx.stage, ctx.selection, value.toLowerCase());
      const editor = useEditorStore.getState();
      if (wasEditing) editor.startSession(repl);
      else editor.select(repl);
    },
  },
  ...(
    [
      ['left', IconAlignLeft],
      ['center', IconAlignCenter],
      ['right', IconAlignRight],
    ] as const
  ).map(
    ([align, icon]): Action => ({
      id: `format.align.${align}`,
      title: `Align ${align}`,
      icon,
      kind: 'toggle',
      group: 'format',
      when: stylable,
      active: (ctx) => styleValue(ctx, 'text-align') === align,
      run: (ctx) =>
        setStyle(ctx, 'text-align', styleValue(ctx, 'text-align') === align ? undefined : align),
    }),
  ),
  {
    id: 'format.fontFamily',
    title: 'Font',
    kind: 'select',
    group: 'format',
    width: 150,
    when: stylable,
    value: (ctx) => styleValue(ctx, 'font-family') || '',
    options: (ctx) => {
      const opts = fontOptions(ctx.deck);
      // Keep an unknown current value selectable rather than blanking it.
      const current = styleValue(ctx, 'font-family');
      if (current && !opts.some((o) => o.value === current)) {
        opts.push({ value: current, label: current.split(',')[0].replace(/['"]/g, '') });
      }
      return opts;
    },
    run: (ctx, value) => setStyle(ctx, 'font-family', value),
  },
  {
    id: 'format.fontSize',
    title: 'Font size',
    kind: 'select',
    group: 'format',
    width: 86,
    when: stylable,
    value: (ctx) => styleValue(ctx, 'font-size') || '',
    options: () => FONT_SIZES,
    run: (ctx, value) => setStyle(ctx, 'font-size', value),
  },
  {
    id: 'format.textColor',
    title: 'Text color',
    kind: 'color',
    group: 'format',
    width: 90,
    when: stylable,
    value: (ctx) => styleValue(ctx, 'color') || '',
    run: (ctx, value) => setStyle(ctx, 'color', value),
  },
];
