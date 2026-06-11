<script lang="ts">
  import { tick } from "svelte";
  import { goto } from "$app/navigation";
  import { ui } from "$lib/stores/ui.svelte";
  import { vault } from "$lib/stores/vault.svelte";
  import { vaultApi } from "$lib/api/vault";
  import { todayIsoDate, joinReminder, currentTimeHM } from "$lib/utils/reminder";
  import { noteHref, noteRelativePath } from "$lib/utils/notePath";
  import MonthCalendar from "./MonthCalendar.svelte";

  let title = $state("");
  let date = $state(todayIsoDate());
  let time = $state("09:00");
  let repeat = $state("");
  let busy = $state(false);
  let error = $state<string | null>(null);
  let titleEl = $state<HTMLInputElement | undefined>();

  $effect(() => {
    const initial = ui.newReminder;
    if (!initial) return;
    title = "";
    const today = todayIsoDate();
    // Clamp pre-filled past dates (e.g. clicking an old day in the calendar
    // view) to today — past reminders can't be created.
    let d = initial.date ?? today;
    if (d < today) d = today;
    date = d;
    time = initial.time ?? (d === today ? currentTimeHM() : "09:00");
    repeat = "";
    busy = false;
    error = null;
    tick().then(() => titleEl?.focus());
  });

  function pickDay(iso: string) {
    date = iso;
    time = iso === todayIsoDate() ? currentTimeHM() : "09:00";
  }

  const isPast = $derived(
    joinReminder(date, time) < joinReminder(todayIsoDate(), currentTimeHM()),
  );

  async function submit() {
    if (busy) return;
    const trimmed = title.trim();
    if (!trimmed || !vault.path) return;
    // Re-check against the wall clock: the derived flag goes stale if the
    // dialog sits open across minutes.
    if (joinReminder(date, time) < joinReminder(todayIsoDate(), currentTimeHM())) {
      error = "That time has already passed.";
      return;
    }
    busy = true;
    error = null;
    try {
      const iso = joinReminder(date, time);
      const path = await vaultApi.createReminder(vault.path, trimmed, iso, repeat || undefined);
      ui.newReminder = null;
      const rel = noteRelativePath(path, vault.path);
      goto(noteHref(rel));
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      busy = false;
    }
  }

  function close() {
    if (busy) return;
    ui.newReminder = null;
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }
</script>

{#if ui.newReminder !== null}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-backdrop backdrop-blur-sm"
    onclick={(e) => {
      if (e.target === e.currentTarget) close();
    }}
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="w-[24rem] max-w-[90vw] rounded-lg border border-border bg-surface-1 p-6 shadow-2xl"
      onkeydown={onKey}
    >
      <h2 class="text-lg font-semibold text-fg">New reminder</h2>
      <div class="mt-4 space-y-3">
        <label class="block">
          <span class="text-xs text-fg-subtle">Title</span>
          <input
            bind:this={titleEl}
            bind:value={title}
            placeholder="Call dentist"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck="false"
            class="mt-0.5 w-full bg-surface-2 border border-border-strong rounded px-2 py-1 text-sm text-fg outline-none placeholder:text-fg-faint"
          />
        </label>
        <div class="flex gap-3">
          <label class="block">
            <span class="text-xs text-fg-subtle">Time</span>
            <input
              type="time"
              bind:value={time}
              spellcheck="false"
              class="mt-0.5 block w-28 bg-surface-2 border border-border-strong rounded px-2 py-1 text-sm text-fg outline-none"
            />
          </label>
          <label class="block">
            <span class="text-xs text-fg-subtle">Repeat</span>
            <select
              bind:value={repeat}
              class="mt-0.5 block bg-surface-2 border border-border-strong rounded px-2 py-1 text-sm text-fg outline-none"
            >
              <option value="">No repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Every 2 weeks</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </label>
        </div>
        <div>
          <span class="text-xs text-fg-subtle">Date</span>
          <div class="mt-0.5 rounded border border-border-strong bg-surface-2 p-2">
            <MonthCalendar selected={date} min={todayIsoDate()} onSelect={pickDay} />
          </div>
        </div>
        {#if isPast}
          <p class="text-xs text-amber-400">That time has already passed.</p>
        {/if}
        {#if error}
          <p class="text-xs text-red-400 break-words">{error}</p>
        {/if}
      </div>
      <div class="mt-5 flex items-center justify-end gap-2">
        <button
          type="button"
          onclick={close}
          class="px-3 py-1.5 text-sm text-fg-muted hover:text-fg"
          disabled={busy}
        >
          Cancel
        </button>
        <button
          type="button"
          onclick={submit}
          class="px-3 py-1.5 rounded bg-accent text-accent-fg text-sm hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!title.trim() || busy || isPast}
        >
          {busy ? "Creating…" : "Create reminder"}
        </button>
      </div>
    </div>
  </div>
{/if}
