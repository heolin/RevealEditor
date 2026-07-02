import { useRef, useState } from 'react';
import { ActionIcon, Group, Menu, Popover, TextInput, Tooltip } from '@mantine/core';
import { IconLink, IconLinkOff, IconPhoto } from '@tabler/icons-react';
import type { EditorContext, SurfaceVariant } from './types';
import { linkAtSelection, removeLink, setLink, insertHtmlSnippet } from '../commands';
import { api } from '../../api/client';

/** Link popover — the one format control that needs its own input UI. */
export function LinkControl({ ctx, variant }: { ctx: EditorContext; variant: SurfaceVariant }) {
  const [open, setOpen] = useState(false);
  const [href, setHref] = useState('');
  if (!ctx.stage) return null;
  const stage = ctx.stage;

  const target = (
    <Tooltip label="Link">
      <ActionIcon
        variant="subtle"
        color="gray"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          setHref(linkAtSelection(stage)?.getAttribute('href') ?? '');
          setOpen((o) => !o);
        }}
      >
        <IconLink size={16} />
      </ActionIcon>
    </Tooltip>
  );
  if (variant === 'menu') return null; // links only make sense with a live text selection

  return (
    <Popover opened={open} onChange={setOpen} position="bottom" withinPortal trapFocus={false}>
      <Popover.Target>{target}</Popover.Target>
      <Popover.Dropdown onMouseDown={(e) => e.stopPropagation()}>
        <Group gap={4}>
          <TextInput
            size="xs"
            w={220}
            placeholder="https://…"
            value={href}
            onChange={(e) => setHref(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && href) {
                setLink(stage, href);
                setOpen(false);
              }
            }}
          />
          <ActionIcon
            variant="filled"
            disabled={!href}
            onClick={() => {
              setLink(stage, href);
              setOpen(false);
            }}
          >
            <IconLink size={14} />
          </ActionIcon>
          <Tooltip label="Remove link">
            <ActionIcon
              variant="default"
              onClick={() => {
                removeLink(stage);
                setOpen(false);
              }}
            >
              <IconLinkOff size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Popover.Dropdown>
    </Popover>
  );
}

/** Image insertion — needs a hidden file input for uploads. */
export function ImageInsertControl({ ctx, variant }: { ctx: EditorContext; variant: SurfaceVariant }) {
  const fileRef = useRef<HTMLInputElement>(null);
  if (!ctx.stage || !ctx.deck) return null;
  const stage = ctx.stage;
  const deckPath = ctx.deck.path;
  const after = ctx.selection;

  const input = (
    <input
      ref={fileRef}
      type="file"
      accept="image/*"
      hidden
      onChange={async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const { url } = await api.uploadAsset(deckPath, file);
        insertHtmlSnippet(stage, `<img src="${url}" alt="">`, after);
        e.target.value = '';
      }}
    />
  );

  if (variant === 'menu') {
    return (
      <>
        <Menu.Item leftSection={<IconPhoto size={14} />} onClick={() => fileRef.current?.click()}>
          Image…
        </Menu.Item>
        {input}
      </>
    );
  }
  return (
    <>
      <Tooltip label="Insert image">
        <ActionIcon variant="subtle" color="gray" onClick={() => fileRef.current?.click()}>
          <IconPhoto size={16} />
        </ActionIcon>
      </Tooltip>
      {input}
    </>
  );
}
