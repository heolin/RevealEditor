import { Fragment, useEffect, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Button,
  Divider,
  Group,
  Text,
  Tooltip,
  useMantineColorScheme,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconChevronLeft,
  IconCloudDownload,
  IconFileTypePdf,
  IconFileZip,
  IconMoon,
  IconPlayerPlay,
  IconSun,
} from '@tabler/icons-react';
import { api } from '../api/client';
import { useDeckStore } from '../state/deckStore';
import { useEditorContext } from '../editor/actions/context';
import { resolveLayout } from '../editor/actions';
import { getLayout } from '../editor/actions/layouts';
import { ActionControl } from '../editor/actions/ActionControl';
import { InsertMenu } from '../editor/overlay/EditorOverlay';

export function Toolbar() {
  const meta = useDeckStore((s) => s.meta)!;
  const dirty = useDeckStore((s) => s.dirty);
  const saving = useDeckStore((s) => s.saving);
  const save = useDeckStore((s) => s.save);
  const close = useDeckStore((s) => s.close);
  const externalMtime = useDeckStore((s) => s.externalMtime);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [zipBusy, setZipBusy] = useState(false);
  const [bundleBusy, setBundleBusy] = useState(false);
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();

  // Freshness poll: surface edits made OUTSIDE the editor as a banner
  // instead of a surprise 409 at save time.
  useEffect(() => {
    const timer = setInterval(async () => {
      const s = useDeckStore.getState();
      if (!s.meta || s.saving) return;
      try {
        const stat = await api.deckStat(s.meta.path);
        if (stat.mtime > s.mtime && stat.mtime !== s.externalMtime) {
          s.setExternalMtime(stat.mtime);
        }
      } catch {
        /* transient poll failures are fine */
      }
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  /**
   * PDF export (FEATURES §N). Phase 2 first: the server renders a real .pdf
   * via headless Chromium when the optional dependency is installed. On 501
   * (or failure) fall back to phase 1 — reveal's own print pipeline in a new
   * tab, where the user picks "Save as PDF".
   */
  async function exportPdf() {
    if (useDeckStore.getState().dirty) await save();
    setPdfBusy(true);
    try {
      const res = await fetch(`/api/deck/pdf?path=${encodeURIComponent(meta.path)}`, {
        method: 'POST',
      });
      if (res.ok) {
        const url = URL.createObjectURL(await res.blob());
        const a = document.createElement('a');
        a.href = url;
        a.download = `${meta.path.split('/').pop()!.replace(/\.html$/, '')}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }
    } catch {
      /* fall through to the guided print flow */
    } finally {
      setPdfBusy(false);
    }
    openPrintView();
  }

  /**
   * Export the deck + its local assets as a .zip (FEATURES §N). Saves first
   * so the archive reflects on-screen edits, then downloads the blob.
   */
  async function exportZip() {
    if (useDeckStore.getState().dirty) await save();
    setZipBusy(true);
    try {
      const res = await fetch(`/api/deck/zip?path=${encodeURIComponent(meta.path)}`);
      if (!res.ok) return;
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `${meta.path.split('/').pop()!.replace(/\.html$/, '')}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* download failed — leave the deck untouched */
    } finally {
      setZipBusy(false);
    }
  }

  /**
   * Bundle offline (FEATURES §N): the server vendors the deck's remote
   * reveal.js `<link>`/`<script>` files into `<deckdir>/vendor/` and rewrites
   * the hrefs. Saves first, then reloads from disk to pick up the rewritten
   * head (and reset the freshness baseline after the server-side write).
   */
  async function bundleOffline() {
    if (useDeckStore.getState().dirty) await save();
    setBundleBusy(true);
    try {
      const res = await fetch(`/api/deck/bundle?path=${encodeURIComponent(meta.path)}`, {
        method: 'POST',
      });
      if (!res.ok) {
        alert('Bundling failed. The deck was left unchanged.');
        return;
      }
      const data = (await res.json()) as { bundled: string[]; failed: { url: string }[] };
      await useDeckStore.getState().reloadFromDisk();
      if (data.bundled.length === 0 && data.failed.length === 0) {
        alert('Nothing to bundle — this deck already loads only local files.');
      } else if (data.failed.length > 0) {
        alert(
          `Bundled ${data.bundled.length} file(s) into vendor/. ` +
            `${data.failed.length} could not be downloaded and still load from the network:\n` +
            data.failed.map((f) => `• ${f.url}`).join('\n'),
        );
      } else {
        alert(`Bundled ${data.bundled.length} file(s) into vendor/. This deck now presents offline.`);
      }
    } catch {
      alert('Bundling failed. The deck was left unchanged.');
    } finally {
      setBundleBusy(false);
    }
  }

  function openPrintView() {
    const w = window.open(`/files/${meta.path}?print-pdf`, '_blank');
    if (!w) return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      try {
        if (w.closed) return clearInterval(timer);
        const ready =
          w.document.readyState === 'complete' && w.document.querySelector('.pdf-page');
        if (ready || Date.now() - startedAt > 10_000) {
          clearInterval(timer);
          setTimeout(() => w.print(), 400); // let the print layout settle
        }
      } catch {
        clearInterval(timer); // window navigated somewhere we can't see
      }
    }, 250);
  }

  return (
    <div className="toolbar">
      <Group gap="xs" px="sm" py={4} wrap="nowrap">
        <Tooltip label="Back to presentations">
          <ActionIcon variant="subtle" color="gray" onClick={close}>
            <IconChevronLeft size={18} />
          </ActionIcon>
        </Tooltip>
        <Text fw={600} size="sm" truncate style={{ minWidth: 0 }}>
          {meta.title || meta.path}
        </Text>
        {dirty && <span className="dirty-dot" title="Unsaved changes" />}
        <div style={{ flex: 1 }} />
        <Tooltip label={`Switch editor to ${colorScheme === 'light' ? 'dark' : 'light'} mode`}>
          <ActionIcon variant="subtle" color="gray" onClick={toggleColorScheme}>
            {colorScheme === 'light' ? <IconMoon size={18} /> : <IconSun size={18} />}
          </ActionIcon>
        </Tooltip>
        <Tooltip label='Save as PDF via the print dialog — pick "Save as PDF", margins: None'>
          <Button
            size="xs"
            variant="default"
            loading={pdfBusy}
            leftSection={<IconFileTypePdf size={14} />}
            onClick={() => void exportPdf()}
          >
            PDF
          </Button>
        </Tooltip>
        <Tooltip label="Download the deck + its local assets as a .zip">
          <Button
            size="xs"
            variant="default"
            loading={zipBusy}
            leftSection={<IconFileZip size={14} />}
            onClick={() => void exportZip()}
          >
            ZIP
          </Button>
        </Tooltip>
        <Tooltip label="Download the deck's CDN reveal.js files into vendor/ so it presents offline">
          <Button
            size="xs"
            variant="default"
            loading={bundleBusy}
            leftSection={<IconCloudDownload size={14} />}
            onClick={() => void bundleOffline()}
          >
            Offline
          </Button>
        </Tooltip>
        <Tooltip label="Open the real file — exactly what your audience sees">
          <Button
            size="xs"
            variant="default"
            leftSection={<IconPlayerPlay size={14} />}
            onClick={() => window.open(`/files/${meta.path}`, '_blank')}
          >
            Present
          </Button>
        </Tooltip>
        <Button size="xs" disabled={!dirty} loading={saving} onClick={() => void save()}>
          Save
        </Button>
      </Group>
      <FormatRibbon />
      {externalMtime !== null && (
        <Alert
          color="yellow"
          icon={<IconAlertTriangle size={16} />}
          py={4}
          radius={0}
          title={undefined}
        >
          <Group gap="sm" wrap="nowrap">
            <Text size="sm">
              This file changed on disk outside the editor.
              {dirty ? ' Reloading discards your unsaved edits.' : ''}
            </Text>
            <Button
              size="compact-xs"
              variant="filled"
              color="yellow"
              onClick={() => void useDeckStore.getState().reloadFromDisk()}
            >
              {dirty ? 'Reload (discard my edits)' : 'Reload from disk'}
            </Button>
            <Button
              size="compact-xs"
              variant="subtle"
              color="gray"
              onClick={() => useDeckStore.getState().setExternalMtime(null)}
            >
              Keep editing
            </Button>
          </Group>
        </Alert>
      )}
    </div>
  );
}

/**
 * The ribbon row. Actions HIDE when they don't apply (no disabled button
 * graveyards); during a text session the freed space hosts the full text
 * toolbar inline — one row, one home for text formatting.
 */
function FormatRibbon() {
  const ctx = useEditorContext();
  const groups = resolveLayout(getLayout('top'), ctx);
  const textGroups = ctx.session === 'text' ? resolveLayout(getLayout('textBar'), ctx) : [];
  return (
    <Group gap={4} px="sm" py={4} wrap="nowrap" className="ribbon">
      <InsertMenu />
      {groups.map((group, gi) => (
        <Fragment key={gi}>
          {gi > 0 && <Divider orientation="vertical" />}
          {group.map((action) => (
            <ActionControl key={action.id} action={action} ctx={ctx} variant="toolbar" />
          ))}
        </Fragment>
      ))}
      {textGroups.length > 0 && (
        <Group gap={4} wrap="nowrap" className="text-bar">
          {textGroups.map((group, gi) => (
            <Fragment key={gi}>
              <Divider orientation="vertical" />
              {group.map((action) => (
                <ActionControl key={action.id} action={action} ctx={ctx} variant="toolbar" />
              ))}
            </Fragment>
          ))}
        </Group>
      )}
    </Group>
  );
}
