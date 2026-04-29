<script lang="ts">
  import "../app.css";
  import { onMount, untrack } from "svelte";
  import { page } from "$app/state";
  import { ui } from "$lib/stores/ui.svelte";
  import { vault } from "$lib/stores/vault.svelte";
  import { tasks } from "$lib/stores/tasks.svelte";
  import { boards } from "$lib/stores/boards.svelte";
  import { notes } from "$lib/stores/notes.svelte";
  import { vaultApi } from "$lib/api/vault";
  import { startSync } from "$lib/sync";
  import { startScheduler, stopScheduler, runCheckNow } from "$lib/scheduler";
  import VaultSetup from "$lib/components/VaultSetup.svelte";
  import TaskDetailPanel from "$lib/components/TaskDetailPanel.svelte";
  import NotesTree from "$lib/components/NotesTree.svelte";
  import Terminal from "$lib/components/Terminal.svelte";
  import { fly } from "svelte/transition";
  import { quintOut } from "svelte/easing";
  import type { UnlistenFn } from "@tauri-apps/api/event";

  let notesExpanded = $state(new Set<string>());
  let terminalHeight = $state(240);

  function startTerminalResize(e: MouseEvent) {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = terminalHeight;
    const onMove = (ev: MouseEvent) => {
      const delta = startY - ev.clientY;
      const next = Math.max(80, Math.min(window.innerHeight - 120, startHeight + delta));
      terminalHeight = next;
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "ns-resize";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const activeBoard = $derived(
    page.url.pathname.startsWith("/boards/")
      ? decodeURIComponent(page.url.pathname.slice("/boards/".length).split("/")[0])
      : null,
  );

  let { children } = $props();

  onMount(() => {
    vault.load();
    let unlisten: UnlistenFn | null = null;
    startSync().then((u) => (unlisten = u));
    return () => {
      unlisten?.();
      stopScheduler();
    };
  });

  $effect(() => {
    if (vault.path) {
      tasks.loadFromVault(vault.path);
      notes.loadFromVault(vault.path);
      boards.load(vault.path);
      vaultApi.watchVault(vault.path).catch((e) => console.error("watch_vault failed", e));
      untrack(() => startScheduler());
    }
  });

  $effect(() => {
    if (tasks.isLoaded && vault.path) {
      untrack(() => runCheckNow());
    }
  });

  $effect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        ui.terminalOpen = !ui.terminalOpen;
        return;
      }
      if (e.key === "Escape" && ui.openTaskPath) {
        ui.openTaskPath = null;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  function basename(p: string) {
    return p.split("/").filter(Boolean).pop() ?? p;
  }
</script>

<div class="flex flex-col h-screen w-screen overflow-hidden bg-neutral-950 text-neutral-100">
  <div class="flex flex-1 min-h-0">
    <aside class="w-60 shrink-0 border-r border-neutral-800 bg-neutral-900 flex flex-col">
      <div class="px-4 py-3 border-b border-neutral-800">
        <h1 class="text-sm font-semibold tracking-wide">Silex</h1>
        {#if vault.path}
          <p class="mt-0.5 text-xs text-neutral-500 truncate" title={vault.path}>
            {basename(vault.path)}
          </p>
        {/if}
      </div>
      <nav class="flex-1 overflow-y-auto p-2 text-sm space-y-3">
        <div>
          <a
            href="/calendar"
            class="block px-2 py-1 rounded {page.url.pathname === '/calendar'
              ? 'bg-neutral-800 text-neutral-100'
              : 'text-neutral-300 hover:bg-neutral-800/60'}"
          >
            Calendar
          </a>
        </div>

        <div>
          <div class="px-2 py-1 text-xs uppercase tracking-wide text-neutral-500">Boards</div>
          {#if !vault.path}
            <div class="px-2 py-1 text-neutral-600 italic">No vault loaded</div>
          {:else if !tasks.isLoaded}
            <div class="px-2 py-1 text-neutral-600 italic">Loading…</div>
          {:else if tasks.error}
            <div class="px-2 py-1 text-red-400 text-xs">{tasks.error}</div>
          {:else if boards.list.length === 0}
            <div class="px-2 py-1 text-neutral-600 italic">No boards yet</div>
          {:else}
            {#each boards.list as board (board.name)}
              <a
                href="/boards/{encodeURIComponent(board.name)}"
                class="block px-2 py-1 rounded truncate {activeBoard === board.name
                  ? 'bg-neutral-800 text-neutral-100'
                  : 'text-neutral-300 hover:bg-neutral-800/60'}"
                title={board.name}
              >
                {board.name}
                <span class="text-xs text-neutral-600">({board.columns.length})</span>
              </a>
            {/each}
          {/if}
        </div>

        <div>
          <div class="px-2 py-1 text-xs uppercase tracking-wide text-neutral-500">Notes</div>
          {#if !vault.path}
            <div class="px-2 py-1 text-neutral-600 italic">No vault loaded</div>
          {:else if !notes.isLoaded}
            <div class="px-2 py-1 text-neutral-600 italic">Loading…</div>
          {:else if notes.error}
            <div class="px-2 py-1 text-red-400 text-xs">{notes.error}</div>
          {:else if notes.tree.length === 0}
            <div class="px-2 py-1 text-neutral-600 italic">No notes yet</div>
          {:else}
            <NotesTree nodes={notes.tree} bind:expanded={notesExpanded} />
          {/if}
        </div>
      </nav>
    </aside>
    <main class="flex-1 overflow-auto flex flex-col min-w-0">
      {@render children()}
    </main>
  </div>

  {#if ui.terminalOpen}
    <section
      class="shrink-0 border-t border-neutral-800 bg-black text-neutral-200 font-mono text-sm flex flex-col"
      style="height: {terminalHeight}px"
    >
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div
        role="separator"
        aria-orientation="horizontal"
        onmousedown={startTerminalResize}
        class="h-1 -mt-0.5 cursor-ns-resize hover:bg-neutral-700 shrink-0"
      ></div>
      <div class="flex items-center justify-between px-3 py-1 border-b border-neutral-800 text-xs text-neutral-500">
        <span>Terminal</span>
        <button
          onclick={() => (ui.terminalOpen = false)}
          class="hover:text-neutral-200"
          aria-label="Close terminal panel"
        >
          close
        </button>
      </div>
      <div class="flex-1 min-h-0">
        <Terminal />
      </div>
    </section>
  {/if}
</div>

{#if vault.isLoaded && !vault.path}
  <VaultSetup />
{/if}

{#if ui.openTaskPath}
  <div
    class="fixed right-0 top-0 bottom-0 z-40"
    transition:fly={{ x: 640, duration: 220, easing: quintOut }}
  >
    {#key ui.openTaskPath}
      <TaskDetailPanel path={ui.openTaskPath} />
    {/key}
  </div>
{/if}
