import { useState } from 'react';
import {
  ActionIcon,
  Group,
  Menu,
  Paper,
  Popover,
  Select,
  TextInput,
  Tooltip,
} from '@mantine/core';
import {
  IconBold,
  IconCopy,
  IconItalic,
  IconLink,
  IconLinkOff,
  IconList,
  IconListNumbers,
  IconPlus,
  IconStrikethrough,
  IconTrash,
} from '@tabler/icons-react';
import { useEditorStore } from '../editorStore';
import { handlerFor } from '../registry';
import {
  convertListToParagraphs,
  convertToList,
  deleteElement,
  duplicateElement,
  execInline,
  insertHtmlSnippet,
  insertList,
  linkAtSelection,
  removeLink,
  renameElement,
  setLink,
} from '../commands';

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

function boxFor(el: HTMLElement, scale: number): Box {
  const r = el.getBoundingClientRect();
  return { left: r.left * scale, top: r.top * scale, width: r.width * scale, height: r.height * scale };
}

/** Selection/hover chrome + floating toolbar, drawn OVER the scaled stage. */
export function EditorOverlay({ scale }: { scale: number }) {
  // docVersion subscription drives re-measurement on every mutation.
  useEditorStore((s) => s.docVersion);
  const selectedEl = useEditorStore((s) => s.selectedEl);
  const hoveredEl = useEditorStore((s) => s.hoveredEl);
  const sessionEl = useEditorStore((s) => s.sessionEl);

  const target = sessionEl ?? selectedEl;
  const connected = target?.isConnected ? target : null;

  return (
    <div className="editor-overlay">
      {hoveredEl?.isConnected && hoveredEl !== connected && (
        <div className="hover-outline" style={boxFor(hoveredEl, scale)} />
      )}
      {connected && (
        <>
          <div
            className={`selection-box${sessionEl ? ' editing' : ''}`}
            style={boxFor(connected, scale)}
          >
            {sessionEl && <span className="selection-label">EDIT</span>}
          </div>
          <FloatingToolbar el={connected} box={boxFor(connected, scale)} editing={!!sessionEl} />
        </>
      )}
    </div>
  );
}

const HEADING_TAGS = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P'];
const TOOLBAR_HEIGHT = 40;

function FloatingToolbar({ el, box, editing }: { el: HTMLElement; box: Box; editing: boolean }) {
  const ctx = useEditorStore((s) => s.ctx);
  const startSession = useEditorStore((s) => s.startSession);
  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState('');
  if (!ctx) return null;

  const tag = el.tagName;
  const isHeadingish = HEADING_TAGS.includes(tag);
  const isList = tag === 'UL' || tag === 'OL';
  const handler = handlerFor(el);
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();

  const top = box.top - TOOLBAR_HEIGHT - 6 >= 0 ? box.top - TOOLBAR_HEIGHT - 6 : box.top + box.height + 6;
  const left = Math.max(4, box.left);

  function changeTag(next: string | null) {
    if (!next || !ctx) return;
    const wasEditing = editing;
    const repl = renameElement(ctx, el, next.toLowerCase());
    if (wasEditing) startSession(repl);
    else useEditorStore.getState().select(repl);
  }

  return (
    <Paper
      className="floating-toolbar"
      shadow="md"
      p={4}
      withBorder
      style={{ top, left }}
      onMouseDown={keepFocus}
    >
      <Group gap={4} wrap="nowrap">
        {(isHeadingish || (editing && !isList)) && (
          <Select
            size="xs"
            w={76}
            value={isHeadingish ? tag : null}
            data={HEADING_TAGS.map((t) => ({ value: t, label: t === 'P' ? 'Text' : t }))}
            onChange={changeTag}
            comboboxProps={{ withinPortal: true }}
          />
        )}
        {editing && (
          <>
            <Tooltip label="Bold (Ctrl+B)">
              <ActionIcon variant="subtle" color="gray" onMouseDown={keepFocus} onClick={() => execInline(ctx, 'bold')}>
                <IconBold size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Italic (Ctrl+I)">
              <ActionIcon variant="subtle" color="gray" onMouseDown={keepFocus} onClick={() => execInline(ctx, 'italic')}>
                <IconItalic size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Strikethrough">
              <ActionIcon
                variant="subtle"
                color="gray"
                onMouseDown={keepFocus}
                onClick={() => execInline(ctx, 'strikeThrough')}
              >
                <IconStrikethrough size={16} />
              </ActionIcon>
            </Tooltip>
            <Popover
              opened={linkOpen}
              onChange={setLinkOpen}
              position="bottom"
              withinPortal
              trapFocus={false}
            >
              <Popover.Target>
                <Tooltip label="Link">
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    onMouseDown={keepFocus}
                    onClick={() => {
                      setHref(linkAtSelection(ctx)?.getAttribute('href') ?? '');
                      setLinkOpen((o) => !o);
                    }}
                  >
                    <IconLink size={16} />
                  </ActionIcon>
                </Tooltip>
              </Popover.Target>
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
                        setLink(ctx, href);
                        setLinkOpen(false);
                      }
                    }}
                  />
                  <ActionIcon
                    variant="filled"
                    disabled={!href}
                    onClick={() => {
                      setLink(ctx, href);
                      setLinkOpen(false);
                    }}
                  >
                    <IconLink size={14} />
                  </ActionIcon>
                  <Tooltip label="Remove link">
                    <ActionIcon
                      variant="default"
                      onClick={() => {
                        removeLink(ctx);
                        setLinkOpen(false);
                      }}
                    >
                      <IconLinkOff size={14} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Popover.Dropdown>
            </Popover>
            <Tooltip label="Bullet list">
              <ActionIcon
                variant="subtle"
                color="gray"
                onMouseDown={keepFocus}
                onClick={() => (isList ? insertList(ctx, false) : insertList(ctx, false))}
              >
                <IconList size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Numbered list">
              <ActionIcon
                variant="subtle"
                color="gray"
                onMouseDown={keepFocus}
                onClick={() => insertList(ctx, true)}
              >
                <IconListNumbers size={16} />
              </ActionIcon>
            </Tooltip>
          </>
        )}
        {!editing && (
          <>
            {tag === 'P' && (
              <Tooltip label="Turn into bullet list">
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  onClick={() => convertToList(ctx, el, false)}
                >
                  <IconList size={16} />
                </ActionIcon>
              </Tooltip>
            )}
            {isList && (
              <Tooltip label="Turn into paragraphs">
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  onClick={() => {
                    const first = convertListToParagraphs(ctx, el);
                    if (first) useEditorStore.getState().select(first);
                  }}
                >
                  <IconListNumbers size={16} />
                </ActionIcon>
              </Tooltip>
            )}
            <InsertMenu after={el} />
            <Tooltip label="Duplicate (Ctrl+D)">
              <ActionIcon variant="subtle" color="gray" onClick={() => duplicateElement(ctx, el)}>
                <IconCopy size={16} />
              </ActionIcon>
            </Tooltip>
            {handler.capabilities.delete && (
              <Tooltip label="Delete">
                <ActionIcon variant="subtle" color="red" onClick={() => deleteElement(ctx, el)}>
                  <IconTrash size={16} />
                </ActionIcon>
              </Tooltip>
            )}
          </>
        )}
      </Group>
    </Paper>
  );
}

const SNIPPETS: { label: string; html: string }[] = [
  { label: 'Heading', html: '<h2>Heading</h2>' },
  { label: 'Text', html: '<p>Text</p>' },
  { label: 'Bullet list', html: '<ul>\n  <li>First item</li>\n  <li>Second item</li>\n</ul>' },
  { label: 'Quote', html: '<blockquote>Quote</blockquote>' },
];

export function InsertMenu({ after }: { after?: HTMLElement | null }) {
  const ctx = useEditorStore((s) => s.ctx);
  if (!ctx) return null;
  return (
    <Menu withinPortal position="bottom-start">
      <Menu.Target>
        <Tooltip label="Insert">
          <ActionIcon variant="subtle" color="gray">
            <IconPlus size={16} />
          </ActionIcon>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown>
        {SNIPPETS.map((s) => (
          <Menu.Item key={s.label} onClick={() => insertHtmlSnippet(ctx, s.html, after)}>
            {s.label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
