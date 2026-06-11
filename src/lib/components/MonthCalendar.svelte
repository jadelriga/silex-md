<script lang="ts">
  import { untrack } from "svelte";
  import { monthGrid, addMonths, monthLabel, monthOf } from "$lib/utils/calendarGrid";
  import { todayIsoDate } from "$lib/utils/reminder";

  let {
    selected,
    min,
    onSelect,
  }: {
    selected: string;
    /** Days strictly before this ISO date are disabled (grayed, unselectable). */
    min?: string;
    onSelect: (iso: string) => void;
  } = $props();

  const todayIso = todayIsoDate();
  // Initial month from the initial selection only; the effect below follows
  // later external changes.
  let view = $state(untrack(() => monthOf(selected)));

  // Follow external selection changes into their month; `view` is untracked
  // so the user can freely page months without the effect snapping back.
  $effect(() => {
    const m = monthOf(selected);
    untrack(() => {
      if (m.year !== view.year || m.month !== view.month) view = m;
    });
  });

  const days = $derived(monthGrid(view.year, view.month));
  const weekdays = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
</script>

<div class="select-none">
  <div class="flex items-center justify-between mb-1">
    <button
      type="button"
      onclick={() => (view = addMonths(view.year, view.month, -1))}
      aria-label="Previous month"
      class="p-1 rounded text-fg-muted hover:text-fg hover:bg-surface-3"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5">
        <polyline points="15 18 9 12 15 6" />
      </svg>
    </button>
    <span class="text-sm font-medium text-fg">{monthLabel(view.year, view.month)}</span>
    <button
      type="button"
      onclick={() => (view = addMonths(view.year, view.month, 1))}
      aria-label="Next month"
      class="p-1 rounded text-fg-muted hover:text-fg hover:bg-surface-3"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
  </div>
  <div class="grid grid-cols-7 text-center text-xs text-fg-subtle mb-1">
    {#each weekdays as wd (wd)}
      <div>{wd}</div>
    {/each}
  </div>
  <div class="grid grid-cols-7 gap-0.5">
    {#each days as d (d.iso)}
      {@const disabled = min !== undefined && d.iso < min}
      <button
        type="button"
        {disabled}
        onclick={() => onSelect(d.iso)}
        class="h-7 rounded text-xs tabular-nums {d.iso === selected
          ? 'bg-accent text-accent-fg font-semibold'
          : disabled
            ? 'text-fg-faint/50 cursor-not-allowed'
            : d.inMonth
              ? 'text-fg hover:bg-surface-3'
              : 'text-fg-faint hover:bg-surface-3'} {d.iso === todayIso && d.iso !== selected
          ? 'ring-1 ring-inset ring-fg-faint'
          : ''}"
      >
        {d.day}
      </button>
    {/each}
  </div>
</div>
