import { useEffect, useMemo, useState } from 'react';
import { Card, Group, Modal, Stack, Text, Title, Tooltip } from '@mantine/core';
import {
  api,
  relativeHref,
  themeUrl,
  type DesignSystem,
  type DesignComponent,
} from '../../api/client';
import { useDeckStore } from '../../state/deckStore';
import { useEditorStore } from '../../editor/editorStore';
import { insertHtmlSnippet } from '../../editor/commands';

const PREVIEW_W = 220;
const DESIGN_W = 960;
const DESIGN_H = 700;

/**
 * Design-system component palette. Inserting a component copies its plain
 * HTML into the slide (no runtime binding — decks stay standalone) and links
 * the system's stylesheets into the deck head if they aren't already.
 */
export function ComponentPalette() {
  const open = useEditorStore((s) => s.paletteOpen);
  const [systems, setSystems] = useState<DesignSystem[] | null>(null);

  useEffect(() => {
    if (open && systems === null) {
      api.listDesignSystems().then(setSystems).catch(() => setSystems([]));
    }
  }, [open, systems]);

  if (!open) return null;
  const close = () => useEditorStore.getState().setPaletteOpen(false);

  return (
    <Modal opened onClose={close} title="Insert component" size="64rem">
      {systems === null ? (
        <Text c="dimmed">Loading…</Text>
      ) : systems.length === 0 ? (
        <Stack gap="xs">
          <Text>No design systems found in this workspace.</Text>
          <Text size="sm" c="dimmed">
            Create one by adding a folder with a <code>components.html</code> file where each
            component is a{' '}
            <code>{'<template data-component="id" data-name="Name">…</template>'}</code>, plus the
            system&apos;s CSS (linked from that file). See <code>design/acme/</code> in the demo
            workspace for a working example.
          </Text>
        </Stack>
      ) : (
        <Stack gap="lg">
          {systems.map((system) => (
            <div key={system.dir}>
              <Title order={5} mb="xs">
                {system.name}{' '}
                <Text span size="xs" c="dimmed">
                  {system.dir}
                </Text>
              </Title>
              <Group gap="sm" align="stretch">
                {system.components.map((component) => (
                  <ComponentCard
                    key={component.id}
                    system={system}
                    component={component}
                    onInserted={close}
                  />
                ))}
              </Group>
            </div>
          ))}
        </Stack>
      )}
    </Modal>
  );
}

function ComponentCard({
  system,
  component,
  onInserted,
}: {
  system: DesignSystem;
  component: DesignComponent;
  onInserted(): void;
}) {
  const meta = useDeckStore((s) => s.meta)!;

  // Live mini-render: the component inside a minimal reveal context with the
  // system's CSS — the same trick as the canvas, at card scale.
  const srcDoc = useMemo(() => {
    const theme = themeUrl(meta.path, meta.theme, meta.themeHref);
    const links = [
      '/vendor/reveal.js/dist/reveal.css',
      ...(theme ? [theme] : []),
      ...system.stylesheets.map((s) => `/files/${s}`),
    ]
      .map((href) => `<link rel="stylesheet" href="${href}">`)
      .join('\n');
    const styles = meta.headStyles.map((css) => `<style>${css}</style>`).join('\n');
    return `<!doctype html><html><head><meta charset="utf-8">${links}${styles}
<style>
  html, body { margin: 0; overflow: hidden; width: 100%; height: 100%; }
  .reveal { width: 100%; height: 100%; }
  .reveal .slides { position: absolute; inset: 0; width: ${DESIGN_W}px; height: ${DESIGN_H}px; }
  .reveal .slides > section { display: flex !important; flex-direction: column;
    justify-content: center; align-items: center; width: 100%; height: 100%; position: relative; }
</style></head>
<body class="reveal-viewport"><div class="reveal"><div class="slides">
<section class="present">${component.html}</section>
</div></div></body></html>`;
  }, [meta.path, meta.theme, meta.themeHref, meta.headStyles, system, component]);

  function insert() {
    const editor = useEditorStore.getState();
    const ctx = editor.ctx;
    if (!ctx) return;
    const hrefs = system.stylesheets.map((s) => relativeHref(meta.path, s));
    useDeckStore.getState().linkStylesheets(hrefs);
    insertHtmlSnippet(ctx, component.html, editor.selectedEl);
    onInserted();
  }

  const scale = PREVIEW_W / DESIGN_W;

  return (
    <Tooltip label={component.description ?? component.name} openDelay={400}>
      <Card withBorder padding={6} className="component-card" onClick={insert}>
        <div
          className="component-preview"
          style={{ width: PREVIEW_W, height: DESIGN_H * scale }}
        >
          <iframe
            title={component.name}
            srcDoc={srcDoc}
            tabIndex={-1}
            style={{
              width: DESIGN_W,
              height: DESIGN_H,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              border: 'none',
              pointerEvents: 'none',
            }}
          />
        </div>
        <Text size="xs" fw={600} ta="center" mt={4}>
          {component.name}
        </Text>
      </Card>
    </Tooltip>
  );
}
