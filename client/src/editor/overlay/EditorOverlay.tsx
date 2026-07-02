import { useRef, useState } from 'react';
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
  IconCode,
  IconCopy,
  IconItalic,
  IconLink,
  IconLinkOff,
  IconList,
  IconListNumbers,
  IconPhoto,
  IconPinnedOff,
  IconPlus,
  IconStackPop,
  IconStackPush,
  IconStrikethrough,
  IconTable,
  IconTrash,
} from '@tabler/icons-react';
import { useEditorStore } from '../editorStore';
import { useDeckStore } from '../../state/deckStore';
import { api } from '../../api/client';
import { handlerFor } from '../registry';
import { applyStyle, changeZOrder, isAbsolute, returnToFlow, slideRect } from '../geometry';
import { effectiveFragments } from '../fragments';
import { insertTable } from '../table';
import {
  commit,
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
  const snapGuides = useEditorStore((s) => s.snapGuides);

  const target = sessionEl ?? selectedEl;
  const connected = target?.isConnected ? target : null;

  return (
    <div className="editor-overlay">
      {hoveredEl?.isConnected && hoveredEl !== connected && (
        <div className="hover-outline" style={boxFor(hoveredEl, scale)} />
      )}
      <FragmentBadges scale={scale} />
      {connected && (
        <>
          <div
            className={`selection-box${sessionEl ? ' editing' : ''}`}
            style={boxFor(connected, scale)}
          >
            {sessionEl && <span className="selection-label">EDIT</span>}
          </div>
          {!sessionEl && <ResizeHandles el={connected} scale={scale} />}
          <FloatingToolbar el={connected} box={boxFor(connected, scale)} editing={!!sessionEl} />
        </>
      )}
      {snapGuides?.x != null && (
        <div className="snap-guide vertical" style={{ left: snapGuides.x * scale }} />
      )}
      {snapGuides?.y != null && (
        <div className="snap-guide horizontal" style={{ top: snapGuides.y * scale }} />
      )}
    </div>
  );
}

function FragmentBadges({ scale }: { scale: number }) {
  const ctx = useEditorStore((s) => s.ctx);
  const sessionEl = useEditorStore((s) => s.sessionEl);
  if (!ctx || sessionEl) return null;
  const fragments = effectiveFragments(ctx.section);
  return (
    <>
      {fragments.map((el, i) => {
        const box = boxFor(el, scale);
        return (
          <button
            key={i}
            className="fragment-badge"
            style={{ left: box.left - 9, top: box.top - 9 }}
            title="Fragment — click to select"
            onClick={() => useEditorStore.getState().select(el)}
          >
            {i + 1}
          </button>
        );
      })}
    </>
  );
}

const HANDLE_CURSORS: Record<string, string> = {
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
  ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize',
};

function ResizeHandles({ el, scale }: { el: HTMLElement; scale: number }) {
  const ctx = useEditorStore((s) => s.ctx);
  if (!ctx) return null;
  const capability = handlerFor(el).capabilities.resize;
  if (capability === 'none') return null;
  const absolute = isAbsolute(el);
  const handles =
    capability === 'width'
      ? absolute ? ['e', 'w'] : ['e']
      : absolute ? ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] : ['e', 's', 'se'];

  const box = boxFor(el, scale);

  function startResize(handle: string, down: React.PointerEvent) {
    down.preventDefault();
    down.stopPropagation();
    if (!ctx) return;
    const start = slideRect(ctx, el);
    const isImg = el.tagName === 'IMG';
    const ratio = start.width / Math.max(1, start.height);
    const x0 = down.clientX;
    const y0 = down.clientY;

    function onMove(e: PointerEvent) {
      const dx = (e.clientX - x0) / scale;
      const dy = (e.clientY - y0) / scale;
      let { left, top, width: w, height: h } = start;
      if (handle.includes('e')) w = start.width + dx;
      if (handle.includes('w')) { w = start.width - dx; left = start.left + dx; }
      if (handle.includes('s')) h = start.height + dy;
      if (handle.includes('n')) { h = start.height - dy; top = start.top + dy; }
      if (isImg && (e.shiftKey || handle.length === 2)) h = w / ratio; // aspect lock on corners
      w = Math.max(16, w);
      h = Math.max(16, h);
      const patch: Record<string, string | null> = { width: `${Math.round(w)}px` };
      if (handle.includes('s') || handle.includes('n') || (isImg && handle.length === 2)) {
        patch.height = `${Math.round(h)}px`;
      }
      if (absolute) {
        patch.left = `${Math.round(left)}px`;
        patch.top = `${Math.round(top)}px`;
      }
      applyStyle(el, patch);
      useEditorStore.getState().bump();
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (ctx) commit(ctx);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  return (
    <>
      {handles.map((h) => {
        const style: React.CSSProperties = { cursor: HANDLE_CURSORS[h] };
        if (h.includes('n')) style.top = box.top - 4;
        else if (h.includes('s')) style.top = box.top + box.height - 4;
        else style.top = box.top + box.height / 2 - 4;
        if (h.includes('w')) style.left = box.left - 4;
        else if (h.includes('e')) style.left = box.left + box.width - 4;
        else style.left = box.left + box.width / 2 - 4;
        return (
          <div key={h} className="resize-handle" style={style} onPointerDown={(e) => startResize(h, e)} />
        );
      })}
    </>
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
            {isAbsolute(el) && (
              <>
                <Tooltip label="Bring forward">
                  <ActionIcon variant="subtle" color="gray" onClick={() => changeZOrder(ctx, el, 1)}>
                    <IconStackPop size={16} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Send backward">
                  <ActionIcon variant="subtle" color="gray" onClick={() => changeZOrder(ctx, el, -1)}>
                    <IconStackPush size={16} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Return to flow layout (remove free positioning)">
                  <ActionIcon variant="subtle" color="gray" onClick={() => returnToFlow(ctx, el)}>
                    <IconPinnedOff size={16} />
                  </ActionIcon>
                </Tooltip>
              </>
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
  const meta = useDeckStore((s) => s.meta);
  const imageInput = useRef<HTMLInputElement>(null);
  if (!ctx || !meta) return null;

  return (
    <>
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
          <Menu.Divider />
          <Menu.Item leftSection={<IconPhoto size={14} />} onClick={() => imageInput.current?.click()}>
            Image…
          </Menu.Item>
          <Menu.Item
            leftSection={<IconCode size={14} />}
            onClick={() => {
              const el = insertHtmlSnippet(
                ctx,
                '<pre><code class="language-javascript" data-trim>\nconst answer = 42;\n</code></pre>',
                after,
              );
              if (el) useEditorStore.getState().setCodeEditEl(el);
            }}
          >
            Code block
          </Menu.Item>
          <Menu.Item leftSection={<IconTable size={14} />} onClick={() => insertTable(ctx, after ?? null)}>
            Table
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <input
        ref={imageInput}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const { url } = await api.uploadAsset(meta.path, file);
          insertHtmlSnippet(ctx, `<img src="${url}" alt="">`, after);
          e.target.value = '';
        }}
      />
    </>
  );
}
