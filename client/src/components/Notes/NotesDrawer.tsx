import { useEffect, useRef, useState } from 'react';
import { Button, Textarea } from '@mantine/core';
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import { useDeckStore } from '../../state/deckStore';
import { useEditorStore } from '../../editor/editorStore';
import { getNotes, setNotes } from '../../editor/commands';

/** Speaker notes for the current slide (plain text; rich notes later). */
export function NotesDrawer() {
  const [open, setOpen] = useState(false);
  const ctx = useEditorStore((s) => s.ctx);
  const slideId = useDeckStore((s) => s.selectedSlideId);
  useEditorStore((s) => s.docVersion);

  const [draft, setDraft] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reload the draft when the slide under edit changes.
  useEffect(() => {
    if (ctx) setDraft(getNotes(ctx.section));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideId, ctx]);

  function onChange(value: string) {
    setDraft(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (ctx) setNotes(ctx, value);
    }, 600);
  }

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <div className={`notes-drawer${open ? ' open' : ''}`}>
      <Button
        variant="subtle"
        color="gray"
        size="compact-sm"
        radius={0}
        fullWidth
        leftSection={open ? <IconChevronDown size={14} /> : <IconChevronUp size={14} />}
        onClick={() => setOpen(!open)}
      >
        Speaker notes{!open && draft.trim() ? ' •' : ''}
      </Button>
      {open && (
        <Textarea
          value={draft}
          onChange={(e) => onChange(e.currentTarget.value)}
          placeholder="Notes for this slide — visible in reveal.js speaker view (press S while presenting)."
          autosize
          minRows={3}
          maxRows={8}
          p="xs"
        />
      )}
    </div>
  );
}
