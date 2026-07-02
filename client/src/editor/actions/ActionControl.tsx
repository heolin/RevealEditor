import { ActionIcon, ColorInput, Menu, Select, Tooltip } from '@mantine/core';
import type { Action, EditorContext, SurfaceVariant } from './types';
import { isEnabled } from './index';

/**
 * The one generic renderer: maps an action's kind to a Mantine control.
 * Surfaces differ only in chrome and which layout config they read.
 */
export function ActionControl({
  action,
  ctx,
  variant,
}: {
  action: Action;
  ctx: EditorContext;
  variant: SurfaceVariant;
}) {
  const enabled = isEnabled(action, ctx);
  // Keep text sessions alive across toolbar clicks: mousedown must not blur.
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();

  if (action.render) {
    const Custom = action.render;
    return <Custom ctx={ctx} variant={variant} />;
  }

  if (variant === 'menu') {
    const Icon = action.icon;
    return (
      <Menu.Item
        leftSection={Icon ? <Icon size={14} /> : undefined}
        disabled={!enabled}
        onClick={() => action.run(ctx)}
      >
        {action.title}
      </Menu.Item>
    );
  }

  switch (action.kind) {
    case 'select':
      return (
        <Select
          size="xs"
          w={action.width ?? 110}
          disabled={!enabled}
          value={action.value?.(ctx) ?? null}
          data={action.options?.(ctx) ?? []}
          onChange={(v) => v !== null && action.run(ctx, v)}
          comboboxProps={{ withinPortal: true }}
          aria-label={action.title}
        />
      );
    case 'color': {
      const value = action.value?.(ctx) ?? '';
      return (
        <ColorInput
          key={value}
          size="xs"
          w={action.width ?? 96}
          disabled={!enabled}
          defaultValue={value}
          placeholder="theme"
          withEyeDropper={false}
          onChangeEnd={(v) => v !== value && action.run(ctx, v)}
          aria-label={action.title}
        />
      );
    }
    default: {
      const Icon = action.icon;
      const active = action.active?.(ctx) ?? false;
      return (
        <Tooltip label={action.title}>
          <ActionIcon
            variant={active ? 'light' : 'subtle'}
            color={active ? 'blue' : 'gray'}
            disabled={!enabled}
            onMouseDown={keepFocus}
            onClick={() => action.run(ctx)}
            aria-label={action.title}
          >
            {Icon ? <Icon size={16} /> : action.title[0]}
          </ActionIcon>
        </Tooltip>
      );
    }
  }
}
