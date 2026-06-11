<script lang="ts">
  import { tick, untrack } from "svelte";
  import { clickOutside } from "$lib/utils/clickOutside";
  import {
    splitReminder,
    joinReminder,
    todayIsoDate,
    currentTimeHM,
  } from "$lib/utils/reminder";
  import MonthCalendar from "./MonthCalendar.svelte";

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

  // Existing reminders keep their stored date/time; new ones start at
  // today + the current time.
  const initial = untrack(() =>
    value ? splitReminder(value) : { date: todayIsoDate(), time: currentTimeHM() },
  );
  let date = $state(initial.date);
  let time = $state(initial.time);
  let timeEl = $state<HTMLInputElement | undefined>();

  $effect(() => {
    void timeEl;
    tick().then(() => timeEl?.focus());
  });

  function pickDay(iso: string) {
    date = iso;
    time = iso === todayIsoDate() ? currentTimeHM() : "09:00";
  }

  const isPast = $derived(
    joinReminder(date, time) < joinReminder(todayIsoDate(), currentTimeHM()),
  );

  function save() {
    if (!date) {
      onClose();
      return;
    }
    if (joinReminder(date, time) < joinReminder(todayIsoDate(), currentTimeHM())) {
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
  class="absolute top-full left-0 mt-1 z-30 w-72 rounded-md border border-border bg-surface-1 p-3 shadow-2xl"
>
  <div class="space-y-2">
    <MonthCalendar selected={date} min={todayIsoDate()} onSelect={pickDay} />
    <label class="block">
      <span class="text-xs text-fg-subtle">Time</span>
      <input
        bind:this={timeEl}
        bind:value={time}
        type="time"
        spellcheck="false"
        class="mt-0.5 w-full bg-surface-2 border border-border-strong rounded px-2 py-1 text-sm text-fg outline-none"
      />
    </label>
    {#if isPast}
      <p class="text-xs text-amber-400">That time has already passed.</p>
    {/if}
    <div class="flex items-center gap-2 pt-1">
      <button
        type="button"
        onclick={save}
        disabled={isPast}
        class="flex-1 px-3 py-1 rounded bg-accent text-accent-fg text-sm hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
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
