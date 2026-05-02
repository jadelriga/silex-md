<script lang="ts">
  import { tick } from "svelte";
  import { goto } from "$app/navigation";
  import { ui } from "$lib/stores/ui.svelte";
  import { vault } from "$lib/stores/vault.svelte";
  import { vaultApi } from "$lib/api/vault";
  import { todayIsoDate, joinReminder } from "$lib/utils/reminder";
  import { noteHref, noteRelativePath } from "$lib/utils/notePath";

  let title = $state("");
  let date = $state(todayIsoDate());
  let time = $state("09:00");
  let busy = $state(false);
  let error = $state<string | null>(null);
  let titleEl = $state<HTMLInputElement | undefined>();

  $effect(() => {
    const initial = ui.newReminder;
    if (!initial) return;
    title = "";
    date = initial.date ?? todayIsoDate();
    time = initial.time ?? "09:00";
    busy = false;
    error = null;
    tick().then(() => titleEl?.focus());
  });

  async function submit() {
    if (busy) return;
    const trimmed = title.trim();
    if (!trimmed || !vault.path) return;
    busy = true;
    error = null;
    try {
      const iso = joinReminder(date, time);
      const path = await vaultApi.createReminder(vault.path, trimmed, iso);
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
      class="w-[28rem] max-w-[90vw] rounded-lg border border-border bg-surface-1 p-6 shadow-2xl"
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
        <div class="flex gap-2">
          <label class="flex-1 block">
            <span class="text-xs text-fg-subtle">Date</span>
            <input
              type="date"
              bind:value={date}
              spellcheck="false"
              class="mt-0.5 w-full bg-surface-2 border border-border-strong rounded px-2 py-1 text-sm text-fg outline-none"
            />
          </label>
          <label class="flex-1 block">
            <span class="text-xs text-fg-subtle">Time</span>
            <input
              type="time"
              bind:value={time}
              spellcheck="false"
              class="mt-0.5 w-full bg-surface-2 border border-border-strong rounded px-2 py-1 text-sm text-fg outline-none"
            />
          </label>
        </div>
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
          disabled={!title.trim() || busy}
        >
          {busy ? "Creating…" : "Create reminder"}
        </button>
      </div>
    </div>
  </div>
{/if}
