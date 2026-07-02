import { useState } from 'react';
import { ActionIcon, Text, Tooltip } from '@mantine/core';
import {
  IconBox,
  IconBoxMultiple,
  IconChartBar,
  IconChevronDown,
  IconChevronRight,
  IconChevronUp,
  IconCode,
  IconLetterT,
  IconPhoto,
  IconPin,
  IconShape,
  IconTable,
} from '@tabler/icons-react';
import { useEditorStore } from '../../editor/editorStore';
import { handlerFor } from '../../editor/registry';
import { isAbsolute, isGroupEl } from '../../editor/geometry';
import { isFragment } from '../../editor/fragments';
import { moveSibling } from '../../editor/commands';

const TYPE_ICONS: Record<string, typeof IconBox> = {
  text: IconLetterT,
  image: IconPhoto,
  code: IconCode,
  table: IconTable,
  chart: IconChartBar,
  shape: IconShape,
  generic: IconBox,
};

interface Row {
  el: HTMLElement;
  depth: number;
  hasChildren: boolean;
}

function elementChildren(el: Element): HTMLElement[] {
  return Array.from(el.children).filter(
    (c): c is HTMLElement =>
      (c as HTMLElement).style !== undefined &&
      !(c.tagName === 'ASIDE' && c.classList.contains('notes')),
  );
}

/** Containers worth expanding — not the internals of leaf-ish content. */
function expandable(el: HTMLElement): boolean {
  const type = handlerFor(el).type;
  if (type === 'code' || type === 'chart' || type === 'shape' || type === 'image') return false;
  if (['UL', 'OL', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE'].includes(el.tagName)) {
    return false;
  }
  return elementChildren(el).length > 0;
}

function label(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase();
  const cls = el.getAttribute('class')?.split(/\s+/).filter((c) => c && c !== 'fragment')[0];
  const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 26);
  if (isGroupEl(el)) return 'Group';
  return text ? `${tag} — ${text}` : cls ? `${tag}.${cls}` : `<${tag}>`;
}

/** Figma-style element tree of the current slide. */
export function LayersPanel() {
  useEditorStore((s) => s.docVersion);
  const ctx = useEditorStore((s) => s.ctx);
  const selectedEl = useEditorStore((s) => s.selectedEl);
  const extraSelected = useEditorStore((s) => s.extraSelected);
  const [collapsed, setCollapsed] = useState<Set<HTMLElement>>(new Set());

  if (!ctx) return null;
  const roots = elementChildren(ctx.section);
  if (roots.length === 0) {
    return (
      <Text size="xs" c="dimmed" p="sm">
        The slide is empty — insert something via the + menu.
      </Text>
    );
  }

  const rows: Row[] = [];
  const walk = (els: HTMLElement[], depth: number) => {
    for (const el of els) {
      const kids = expandable(el);
      rows.push({ el, depth, hasChildren: kids });
      if (kids && !collapsed.has(el)) walk(elementChildren(el), depth + 1);
    }
  };
  walk(roots, 0);

  const selectedSet = new Set([selectedEl, ...extraSelected]);

  return (
    <div className="layers">
      {rows.map(({ el, depth, hasChildren }, i) => {
        const type = isGroupEl(el) ? 'group' : handlerFor(el).type;
        const Icon = type === 'group' ? IconBoxMultiple : (TYPE_ICONS[type] ?? IconBox);
        const selected = selectedSet.has(el);
        return (
          <div
            key={i}
            className={`layer-row${selected ? ' selected' : ''}`}
            style={{ paddingLeft: 8 + depth * 16 }}
            onClick={(e) => {
              if (e.shiftKey) useEditorStore.getState().toggleSelect(el);
              else useEditorStore.getState().select(el);
            }}
            onMouseEnter={() => useEditorStore.getState().hover(el)}
            onMouseLeave={() => useEditorStore.getState().hover(null)}
          >
            {hasChildren ? (
              <span
                className="layer-chevron"
                onClick={(e) => {
                  e.stopPropagation();
                  setCollapsed((prev) => {
                    const next = new Set(prev);
                    if (next.has(el)) next.delete(el);
                    else next.add(el);
                    return next;
                  });
                }}
              >
                {collapsed.has(el) ? <IconChevronRight size={12} /> : <IconChevronDown size={12} />}
              </span>
            ) : (
              <span className="layer-chevron" />
            )}
            <Icon size={13} className="layer-icon" />
            <span className="layer-label">{label(el)}</span>
            {isFragment(el) && (
              <Tooltip label="Fragment (revealed step by step)">
                <span className="layer-badge">F</span>
              </Tooltip>
            )}
            {isAbsolute(el) && (
              <Tooltip label="Freely positioned">
                <IconPin size={11} className="layer-badge-icon" />
              </Tooltip>
            )}
            <span className="layer-actions" onClick={(e) => e.stopPropagation()}>
              <ActionIcon
                size={16}
                variant="subtle"
                color="gray"
                title="Move earlier (up in order)"
                onClick={() => moveSibling(ctx, el, 'up')}
              >
                <IconChevronUp size={11} />
              </ActionIcon>
              <ActionIcon
                size={16}
                variant="subtle"
                color="gray"
                title="Move later (down in order)"
                onClick={() => moveSibling(ctx, el, 'down')}
              >
                <IconChevronDown size={11} />
              </ActionIcon>
            </span>
          </div>
        );
      })}
    </div>
  );
}
