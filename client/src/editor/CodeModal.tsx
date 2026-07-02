import { useEffect, useMemo, useState } from 'react';
import { Button, Group, Modal, Select, Switch, TextInput, Tooltip } from '@mantine/core';
import CodeMirror from '@uiw/react-codemirror';
import { languages } from '@codemirror/language-data';
import type { Extension } from '@codemirror/state';
import { useEditorStore } from './editorStore';
import { codeTextOf, languageOf, setCodeText, COMMON_LANGUAGES } from './codeHighlight';
import { commit, setElementAttr } from './commands';

/**
 * Code block editor: CodeMirror over the RAW code text (the truth), plus the
 * reveal.js highlight plugin's attributes (language, data-line-numbers with
 * step syntax, data-trim).
 */
export function CodeModal() {
  const preEl = useEditorStore((s) => s.codeEditEl);
  const ctx = useEditorStore((s) => s.ctx);

  const codeEl = preEl?.querySelector('code') ?? null;
  const [text, setText] = useState('');
  const [language, setLanguage] = useState('plaintext');
  const [lineNumbers, setLineNumbers] = useState('');
  const [trim, setTrim] = useState(true);
  const [cmLang, setCmLang] = useState<Extension | null>(null);

  useEffect(() => {
    if (!codeEl) return;
    setText(codeTextOf(codeEl));
    setLanguage(languageOf(codeEl) ?? 'plaintext');
    setLineNumbers(codeEl.getAttribute('data-line-numbers') ?? '');
    setTrim(codeEl.hasAttribute('data-trim'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeEl]);

  // Load the CodeMirror language support dynamically (code-split by vite).
  useEffect(() => {
    let cancelled = false;
    setCmLang(null);
    const desc =
      languages.find((l) => l.alias.includes(language) || l.name.toLowerCase() === language) ??
      null;
    if (desc) {
      void desc.load().then((support) => {
        if (!cancelled) setCmLang(support);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [language]);

  const extensions = useMemo(() => (cmLang ? [cmLang] : []), [cmLang]);

  if (!preEl || !codeEl || !ctx) return null;

  function close() {
    useEditorStore.getState().setCodeEditEl(null);
  }

  function saveAndClose() {
    if (!ctx || !codeEl) return;
    // Language class: replace only the language-* token, keep everything else.
    const classes = Array.from(codeEl.classList).filter(
      (c) => !c.startsWith('language-') && !c.startsWith('lang-'),
    );
    classes.push(`language-${language}`);
    codeEl.className = classes.join(' ');
    if (lineNumbers.trim()) codeEl.setAttribute('data-line-numbers', lineNumbers.trim());
    else codeEl.removeAttribute('data-line-numbers');
    if (trim) codeEl.setAttribute('data-trim', '');
    else codeEl.removeAttribute('data-trim');
    setCodeText(codeEl, text);
    commit(ctx);
    close();
  }

  return (
    <Modal opened onClose={close} title="Edit code" size="xl">
      <Group gap="sm" mb="sm" align="flex-end">
        <Select
          label="Language"
          size="xs"
          w={160}
          searchable
          value={language}
          data={COMMON_LANGUAGES}
          onChange={(v) => v && setLanguage(v)}
        />
        <Tooltip label={'reveal.js step syntax — e.g. "1-3|4|6-8" highlights ranges step by step'}>
          <TextInput
            label="Highlight lines"
            size="xs"
            w={160}
            placeholder="1-3|4"
            value={lineNumbers}
            onChange={(e) => setLineNumbers(e.currentTarget.value)}
          />
        </Tooltip>
        <Switch
          label="Trim whitespace"
          size="xs"
          checked={trim}
          onChange={(e) => setTrim(e.currentTarget.checked)}
        />
      </Group>
      <CodeMirror
        value={text}
        height="360px"
        theme="dark"
        extensions={extensions}
        onChange={setText}
        autoFocus
      />
      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={close}>
          Cancel
        </Button>
        <Button onClick={saveAndClose}>Save code</Button>
      </Group>
    </Modal>
  );
}

/** Toolbar/insert-menu entry point: create a code block and open the editor. */
export function insertCodeBlockSnippet(): string {
  return '<pre><code class="language-javascript" data-trim>\nconst answer = 42;\n</code></pre>';
}

// setElementAttr is re-exported for the Inspector's code section.
export { setElementAttr };
