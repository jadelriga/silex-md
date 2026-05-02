<script lang="ts">
  import { tick, untrack } from "svelte";
  import { clickOutside } from "$lib/utils/clickOutside";
  import { splitReminder, joinReminder } from "$lib/utils/reminder";

  let {
    value,
    onSave,
    onClear,
    onClose,
  }: {
    value: string | null;
    onSave: (iso: string) => void;
    onClear: () => void;
    onClose: () => void;
  } = $props();

  const initial = untrack(() => splitReminder(value));
  let date = $state(initial.date);
  let time = $state(initial.time);
  let dateEl = $state<HTMLInputElement | undefined>();

  $effect(() => {
    void dateEl;
    tick().then(() => dateEl?.focus());
  });

  function save() {
    if (!date) {
      onClose();
      return;
    }
    onSave(joinReminder(date, time));
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Enter") {
      e.preventDefault();
      save();
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  use:clickOutside={{ callback: onClose }}
  onkeydown={onKey}
  class="absolute top-full left-0 mt-1 z-30 w-64 rounded-md border border-border bg-surface-1 p-3 shadow-2xl"
>
  <div class="space-y-2">
    <label class="block">
      <span class="text-xs text-fg-subtle">Date</span>
      <input
        bind:this={dateEl}
        bind:value={date}
        type="date"
        spellcheck="false"
        class="mt-0.5 w-full bg-surface-2 border border-border-strong rounded px-2 py-1 text-sm text-fg outline-none"
      />
    </label>
    <label class="block">
      <span class="text-xs text-fg-subtle">Time</span>
      <input
        bind:value={time}
        type="time"
        spellcheck="false"
        class="mt-0.5 w-full bg-surface-2 border border-border-strong rounded px-2 py-1 text-sm text-fg outline-none"
      />
    </label>
    <div class="flex items-center gap-2 pt-1">
      <button
        type="button"
        onclick={save}
        class="flex-1 px-3 py-1 rounded bg-accent text-accent-fg text-sm hover:bg-accent-hover"
      >
        Set
      </button>
      {#if value}
        <button
          type="button"
          onclick={onClear}
          class="px-3 py-1 rounded text-sm text-fg-muted hover:text-fg"
        >
          Clear
        </button>
      {/if}
      <button
        type="button"
        onclick={onClose}
        class="px-3 py-1 rounded text-sm text-fg-muted hover:text-fg"
      >
        Cancel
      </button>
    </div>
  </div>
</div>
