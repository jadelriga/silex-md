<script lang="ts">
  import { clickOutside } from "$lib/utils/clickOutside";

  type Option = { value: string; label: string };
  type ChipValue = string | string[] | undefined;

  let {
    label,
    options,
    multi = false,
    value,
    open,
    onOpenChange,
    onChange,
  }: {
    label: string;
    options: Option[];
    multi?: boolean;
    value: ChipValue;
    open: boolean;
    onOpenChange: (next: boolean) => void;
    onChange: (next: ChipValue) => void;
  } = $props();

  function togglePopover(e: MouseEvent) {
    // Stop propagation so the same click doesn't reach the document — the
    // popup's `use:clickOutside` listener registers synchronously when the
    // popup mounts (Svelte 5), and would otherwise immediately fire its
    // "click is outside the popup" callback and close the popup we just
    // opened.
    e.stopPropagation();
    onOpenChange(!open);
  }

  const isActive = $derived(
    multi ? Array.isArray(value) && value.length > 0 : Boolean(value),
  );

  const display = $derived.by(() => {
    if (!isActive) return null;
    if (multi && Array.isArray(value)) {
      if (value.length === 1) {
        return options.find((o) => o.value === value[0])?.label ?? value[0];
      }
      return `${value.length}`;
    }
    if (typeof value === "string") {
      return options.find((o) => o.value === value)?.label ?? value;
    }
    return null;
  });

  function toggle(v: string) {
    if (multi) {
      const arr = Array.isArray(value) ? [...value] : [];
      const idx = arr.indexOf(v);
      if (idx === -1) arr.push(v);
      else arr.splice(idx, 1);
      onChange(arr.length === 0 ? undefined : arr);
    } else {
      onChange(value === v ? undefined : v);
      onOpenChange(false);
    }
  }

  function clear(e: MouseEvent) {
    e.stopPropagation();
    onChange(undefined);
    onOpenChange(false);
  }
</script>

<div class="relative shrink-0">
  <div
    class="flex items-stretch rounded border transition-colors {isActive
      ? 'bg-surface-2 border-border-strong'
      : 'border-border hover:border-border-strong'}"
  >
    <button
      type="button"
      onclick={togglePopover}
      class="px-2 py-1 text-xs flex items-center gap-1 {isActive
        ? 'text-fg'
        : 'text-fg-subtle hover:text-fg'}"
    >
      <span class="uppercase tracking-wide">{label}</span>
      {#if display}
        <span class="text-fg lowercase">: {display}</span>
      {/if}
    </button>
    {#if isActive}
      <button
        type="button"
        onclick={clear}
        class="px-1.5 text-fg-subtle hover:text-fg border-l border-border-strong"
        aria-label="Clear {label} filter">×</button
      >
    {/if}
  </div>
  {#if open}
    <div
      use:clickOutside={{ callback: () => onOpenChange(false) }}
      class="absolute top-full mt-1 left-0 z-10 min-w-36 max-h-64 overflow-y-auto bg-surface-1 border border-border rounded shadow-lg py-1"
    >
      {#each options as opt (opt.value)}
        {@const checked = multi
          ? Array.isArray(value) && value.includes(opt.value)
          : value === opt.value}
        <button
          type="button"
          onclick={() => toggle(opt.value)}
          class="w-full text-left px-3 py-1 text-xs flex items-center gap-2 hover:bg-surface-2 {checked
            ? 'text-fg'
            : 'text-fg-muted'}"
        >
          <span class="w-3 shrink-0">{checked ? "✓" : ""}</span>
          <span>{opt.label}</span>
        </button>
      {/each}
      {#if options.length === 0}
        <div class="px-3 py-1 text-xs text-fg-faint italic">No options</div>
      {/if}
    </div>
  {/if}
</div>
