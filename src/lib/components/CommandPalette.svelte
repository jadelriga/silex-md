<script lang="ts">
  import { tick } from "svelte";
  import { goto } from "$app/navigation";
  import { ui } from "$lib/stores/ui.svelte";
  import { tasks } from "$lib/stores/tasks.svelte";
  import { notes } from "$lib/stores/notes.svelte";
  import { boards } from "$lib/stores/boards.svelte";
  import { vault } from "$lib/stores/vault.svelte";
  import { buildPaletteItems, filterPaletteItems, type PaletteItem } from "$lib/utils/palette";

  let query = $state("");
  let selectedIndex = $state(0);
  let inputEl = $state<HTMLInputElement | undefined>();

  const items = $derived(
    buildPaletteItems({
      boards: boards.list,
      notes: Array.from(notes.entries.values()),
      tasks: Array.from(tasks.entries.values()),
      vaultPath: vault.path,
      goto: (href) => goto(href),
      openTask: (path) => (ui.openTaskPath = path),
      toggleTerminal: () => (ui.terminalOpen = !ui.terminalOpen),
    }),
  );

  const filtered = $derived(filterPaletteItems(items, query));

  $effect(() => {
    if (selectedIndex >= filtered.length) selectedIndex = 0;
  });

  $effect(() => {
    if (ui.paletteOpen) {
      query = "";
      selectedIndex = 0;
      tick().then(() => inputEl?.focus());
    }
  });

  function close() {
    ui.paletteOpen = false;
  }

  function execute(item: PaletteItem) {
    item.run();
    close();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (filtered.length === 0) return;
      selectedIndex = (selectedIndex + 1) % filtered.length;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (filtered.length === 0) return;
      selectedIndex = (selectedIndex - 1 + filtered.length) % filtered.length;
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = filtered[selectedIndex];
      if (item) execute(item);
    }
  }

  const kindLabel: Record<PaletteItem["kind"], string> = {
    board: "board",
    note: "note",
    task: "task",
    action: "action",
  };

  const kindColor: Record<PaletteItem["kind"], string> = {
    board: "text-sky-400",
    note: "text-emerald-400",
    task: "text-amber-400",
    action: "text-neutral-400",
  };
</script>

{#if ui.paletteOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm"
    onclick={(e) => {
      if (e.target === e.currentTarget) close();
    }}
  >
    <div
      class="w-[32rem] max-w-[90vw] rounded-lg border border-neutral-800 bg-neutral-900 shadow-2xl overflow-hidden"
    >
      <input
        bind:this={inputEl}
        bind:value={query}
        onkeydown={onKeydown}
        placeholder="Type a command, board, note, or task…"
        class="w-full bg-transparent px-4 py-3 text-sm text-neutral-100 outline-none border-b border-neutral-800 placeholder:text-neutral-600"
      />
      <ul class="max-h-[50vh] overflow-y-auto py-1">
        {#if filtered.length === 0}
          <li class="px-4 py-3 text-sm text-neutral-500 italic">No matches.</li>
        {:else}
          {#each filtered as item, i (item.id)}
            <li>
              <button
                type="button"
                onclick={(e) => {
                  e.stopPropagation();
                  execute(item);
                }}
                onmouseenter={() => (selectedIndex = i)}
                class="w-full flex items-center gap-3 px-4 py-2 text-sm text-left {i === selectedIndex
                  ? 'bg-neutral-800 text-neutral-100'
                  : 'text-neutral-300 hover:bg-neutral-800/60'}"
              >
                <span class="text-xs uppercase tracking-wide w-14 shrink-0 {kindColor[item.kind]}">
                  {kindLabel[item.kind]}
                </span>
                <span class="flex-1 truncate">{item.label}</span>
                {#if item.hint}
                  <span class="text-xs text-neutral-500 truncate">{item.hint}</span>
                {/if}
              </button>
            </li>
          {/each}
        {/if}
      </ul>
    </div>
  </div>
{/if}
