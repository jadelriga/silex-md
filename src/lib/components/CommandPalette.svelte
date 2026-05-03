<script lang="ts">
  import { tick } from "svelte";
  import { goto } from "$app/navigation";
  import { ui } from "$lib/stores/ui.svelte";
  import { tasks } from "$lib/stores/tasks.svelte";
  import { notes } from "$lib/stores/notes.svelte";
  import { boards } from "$lib/stores/boards.svelte";
  import { vault } from "$lib/stores/vault.svelte";
  import { theme } from "$lib/stores/theme.svelte";
  import { buildPaletteItems, filterPaletteItems, type PaletteItem } from "$lib/utils/palette";
  import { revealItemInDir } from "@tauri-apps/plugin-opener";
  import { appDataDir, join } from "@tauri-apps/api/path";

  let query = $state("");
  let selectedIndex = $state(0);
  let inputEl = $state<HTMLInputElement | undefined>();

  const allItems = $derived(
    buildPaletteItems({
      boards: boards.list,
      notes: Array.from(notes.entries.values()),
      tasks: Array.from(tasks.entries.values()),
      vaultPath: vault.path,
      goto: (href) => goto(href),
      openTask: (path) => (ui.openTaskPath = path),
      toggleTerminal: () => (ui.terminalOpen = !ui.terminalOpen),
      setThemePref: (pref) => void theme.setPref(pref),
      startCreating: (kind) => (ui.creating = kind),
      openNewReminder: () => (ui.newReminder = {}),
      openSettings: () => (ui.settingsOpen = true),
      revealSettings: async () => {
        try {
          const dir = await appDataDir();
          const path = await join(dir, "settings.json");
          await revealItemInDir(path);
        } catch (e) {
          console.error("reveal settings failed", e);
        }
      },
    }),
  );

  const items = $derived(
    ui.paletteMode === null
      ? []
      : allItems.filter((i) => i.category === ui.paletteMode),
  );

  const filtered = $derived(filterPaletteItems(items, query));

  $effect(() => {
    if (selectedIndex >= filtered.length) selectedIndex = 0;
  });

  $effect(() => {
    if (ui.paletteMode !== null) {
      query = "";
      selectedIndex = 0;
      tick().then(() => inputEl?.focus());
    }
  });

  function close() {
    ui.paletteMode = null;
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
    action: "text-fg-muted",
  };

  const placeholder = $derived(
    ui.paletteMode === "navigation"
      ? "Type a board, note, or task…"
      : "Type a command…",
  );

  const heading = $derived(ui.paletteMode === "navigation" ? "Open" : "Commands");
</script>

{#if ui.paletteMode !== null}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-backdrop backdrop-blur-sm"
    onclick={(e) => {
      if (e.target === e.currentTarget) close();
    }}
  >
    <div
      class="w-[32rem] max-w-[90vw] rounded-lg border border-border bg-surface-1 shadow-2xl overflow-hidden"
    >
      <div class="px-4 pt-2 pb-1 text-xs uppercase tracking-wide text-fg-subtle border-b border-border">
        {heading}
      </div>
      <input
        bind:this={inputEl}
        bind:value={query}
        onkeydown={onKeydown}
        {placeholder}
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        class="w-full bg-transparent px-4 py-3 text-sm text-fg outline-none border-b border-border placeholder:text-fg-faint"
      />
      <ul class="max-h-[50vh] overflow-y-auto py-1">
        {#if filtered.length === 0}
          <li class="px-4 py-3 text-sm text-fg-subtle italic">No matches.</li>
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
                  ? 'bg-surface-2 text-fg'
                  : 'text-fg hover:bg-surface-2/60'}"
              >
                <span class="text-xs uppercase tracking-wide w-14 shrink-0 {kindColor[item.kind]}">
                  {kindLabel[item.kind]}
                </span>
                <span class="flex-1 truncate">{item.label}</span>
                {#if item.hint}
                  <span class="text-xs text-fg-subtle truncate">{item.hint}</span>
                {/if}
              </button>
            </li>
          {/each}
        {/if}
      </ul>
    </div>
  </div>
{/if}
