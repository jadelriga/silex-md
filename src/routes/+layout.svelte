<script lang="ts">
  import "../app.css";
  import { onMount, untrack } from "svelte";
  import { page } from "$app/state";
  import { ui } from "$lib/stores/ui.svelte";
  import { vault } from "$lib/stores/vault.svelte";
  import { tasks } from "$lib/stores/tasks.svelte";
  import { boards } from "$lib/stores/boards.svelte";
  import { notes } from "$lib/stores/notes.svelte";
  import { reminders } from "$lib/stores/reminders.svelte";
  import { theme } from "$lib/stores/theme.svelte";
  import { settings } from "$lib/stores/settings.svelte";
  import { vaultApi } from "$lib/api/vault";
  import { startSync } from "$lib/sync";
  import { startScheduler, stopScheduler, runCheckNow } from "$lib/scheduler";
  import VaultSetup from "$lib/components/VaultSetup.svelte";
  import TaskDetailPanel from "$lib/components/TaskDetailPanel.svelte";
  import NotesTree from "$lib/components/NotesTree.svelte";
  import RemindersTree from "$lib/components/RemindersTree.svelte";
  import NewReminderDialog from "$lib/components/NewReminderDialog.svelte";
  import Terminal from "$lib/components/Terminal.svelte";
  import CommandPalette from "$lib/components/CommandPalette.svelte";
  import SearchOverlay from "$lib/components/SearchOverlay.svelte";
  import CreateInput from "$lib/components/CreateInput.svelte";
  import { goto } from "$app/navigation";
  import { noteHref, noteRelativePath } from "$lib/utils/notePath";
  import { ask } from "@tauri-apps/plugin-dialog";
  import { fly } from "svelte/transition";
  import { quintOut } from "svelte/easing";
  import type { UnlistenFn } from "@tauri-apps/api/event";

  let notesExpanded = $state(new Set<string>());

  function startTerminalResize(e: MouseEvent) {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = settings.terminalHeight;
    let lastHeight = startHeight;
    const onMove = (ev: MouseEvent) => {
      const delta = startY - ev.clientY;
      lastHeight = Math.max(80, Math.min(window.innerHeight - 120, startHeight + delta));
      settings.terminalHeight = lastHeight;
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      void settings.setTerminalHeight(lastHeight);
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
    void theme.load();
    void settings.load();
    let unlisten: UnlistenFn | null = null;
    startSync().then((u) => (unlisten = u));
    return () => {
      unlisten?.();
      stopScheduler();
    };
  });

  $effect(() => {
    // re-runs whenever theme.effective changes
    void theme.effective;
    untrack(() => theme.applyToDocument());
  });

  $effect(() => {
    if (vault.path) {
      tasks.loadFromVault(vault.path);
      notes.loadFromVault(vault.path);
      reminders.loadFromVault(vault.path);
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
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        if (ui.paletteOpen) {
          ui.paletteOpen = false;
        } else {
          ui.searchOpen = false;
          ui.paletteOpen = true;
        }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        if (ui.searchOpen) {
          ui.searchOpen = false;
        } else {
          ui.paletteOpen = false;
          ui.searchOpen = true;
        }
        return;
      }
      if (e.key === "Escape" && ui.openTaskPath && !ui.paletteOpen && !ui.searchOpen) {
        ui.openTaskPath = null;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  function basename(p: string) {
    return p.split("/").filter(Boolean).pop() ?? p;
  }

  async function handleCreateBoard(name: string) {
    if (!vault.path) return;
    await vaultApi.createBoard(vault.path, name);
    ui.creating = null;
    await boards.load(vault.path);
    goto(`/boards/${encodeURIComponent(name)}`);
  }

  async function handleCreateNote(relativePath: string) {
    if (!vault.path) return;
    const absolute = await vaultApi.createNote(vault.path, relativePath);
    ui.creating = null;
    const rel = noteRelativePath(absolute, vault.path);
    goto(noteHref(rel));
  }

  async function handleCreateNoteFolder(relativePath: string) {
    if (!vault.path) return;
    await vaultApi.createNoteFolder(vault.path, relativePath);
    ui.creating = null;
    await notes.refreshFolders();
  }

  function onNotesRootDragOver(e: DragEvent) {
    if (!ui.notesDrag) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  }

  async function onNotesRootDrop(e: DragEvent) {
    e.preventDefault();
    const drag = ui.notesDrag;
    ui.notesDrag = null;
    ui.notesDragOver = null;
    if (!drag || !vault.path) return;
    const filename = drag.path.split("/").pop()!;
    const newPath = `${vault.path}/${filename}`;
    if (newPath === drag.path) return;
    try {
      await vaultApi.movePath(drag.path, newPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.startsWith("DestinationExists")) {
        const replace = await ask(`A file already exists at:\n${newPath}\n\nReplace it?`, {
          title: "Replace file?",
          kind: "warning",
          okLabel: "Replace",
          cancelLabel: "Cancel",
        });
        if (replace) {
          try {
            await vaultApi.movePath(drag.path, newPath, true);
          } catch (err2) {
            console.error("Failed to move to root (with overwrite)", err2);
          }
        }
      } else {
        console.error("Failed to move note to root", err);
      }
    }
  }
</script>

<div class="flex flex-col h-screen w-screen overflow-hidden bg-surface text-fg">
  <!-- Custom title bar: draggable across the whole window, themed, leaves room for macOS traffic lights -->
  <div
    class="h-8 shrink-0 flex items-center border-b border-border bg-surface-1 select-none"
    data-tauri-drag-region
  >
    <div class="w-20 shrink-0" data-tauri-drag-region></div>
    <div
      class="flex-1 px-3 text-xs text-fg-subtle truncate"
      data-tauri-drag-region
    >
      silex{vault.path ? ` — ${basename(vault.path)}` : ""}
    </div>
  </div>

  <div class="flex flex-1 min-h-0">
    <aside class="w-60 shrink-0 border-r border-border bg-surface-1 flex flex-col">
      <div class="px-4 py-3 border-b border-border">
        <h1 class="text-sm font-semibold tracking-wide">Silex</h1>
        {#if vault.path}
          <p class="mt-0.5 text-xs text-fg-subtle truncate" title={vault.path}>
            {basename(vault.path)}
          </p>
        {/if}
      </div>
      <nav class="flex-1 overflow-y-auto p-2 text-sm flex flex-col gap-3 min-h-0">
        <div>
          <a
            href="/calendar"
            class="block px-2 py-1 rounded {page.url.pathname === '/calendar'
              ? 'bg-surface-2 text-fg'
              : 'text-fg hover:bg-surface-2/60'}"
          >
            Calendar
          </a>
        </div>

        <div>
          <div class="group px-2 py-1 flex items-center justify-between">
            <span class="text-xs uppercase tracking-wide text-fg-subtle">Boards</span>
            {#if vault.path}
              <button
                onclick={() => (ui.creating = "board")}
                title="New board"
                aria-label="New board"
                class="opacity-0 group-hover:opacity-100 transition-opacity text-fg-subtle hover:text-fg"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4">
                  <path d="M12 5v14M5 12h14" stroke-linecap="round" />
                </svg>
              </button>
            {/if}
          </div>
          {#if ui.creating === "board"}
            <CreateInput
              placeholder="board name"
              onSubmit={handleCreateBoard}
              onCancel={() => (ui.creating = null)}
            />
          {/if}
          {#if !vault.path}
            <div class="px-2 py-1 text-fg-faint italic">No vault loaded</div>
          {:else if !tasks.isLoaded}
            <div class="px-2 py-1 text-fg-faint italic">Loading…</div>
          {:else if tasks.error}
            <div class="px-2 py-1 text-red-400 text-xs">{tasks.error}</div>
          {:else if boards.list.length === 0}
            <div class="px-2 py-1 text-fg-faint italic">No boards yet</div>
          {:else}
            {#each boards.list as board (board.name)}
              <a
                href="/boards/{encodeURIComponent(board.name)}"
                class="block px-2 py-1 rounded truncate {activeBoard === board.name
                  ? 'bg-surface-2 text-fg'
                  : 'text-fg hover:bg-surface-2/60'}"
                title={board.name}
              >
                {board.name}
                <span class="text-xs text-fg-faint">({board.columns.length})</span>
              </a>
            {/each}
          {/if}
        </div>

        <div>
          <div class="group px-2 py-1 flex items-center justify-between">
            <span class="text-xs uppercase tracking-wide text-fg-subtle">Reminders</span>
            {#if vault.path}
              <button
                onclick={() => (ui.newReminder = {})}
                title="New reminder"
                aria-label="New reminder"
                class="opacity-0 group-hover:opacity-100 transition-opacity text-fg-subtle hover:text-fg"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4">
                  <path d="M12 5v14M5 12h14" stroke-linecap="round" />
                </svg>
              </button>
            {/if}
          </div>
          {#if !vault.path}
            <div class="px-2 py-1 text-fg-faint italic">No vault loaded</div>
          {:else if !reminders.isLoaded}
            <div class="px-2 py-1 text-fg-faint italic">Loading…</div>
          {:else if reminders.error}
            <div class="px-2 py-1 text-red-400 text-xs">{reminders.error}</div>
          {:else if reminders.entries.size === 0}
            <div class="px-2 py-1 text-fg-faint italic">No reminders yet</div>
          {:else}
            <RemindersTree />
          {/if}
        </div>

        <div class="flex-1 flex flex-col min-h-0">
          <div class="group px-2 py-1 flex items-center justify-between shrink-0">
            <span class="text-xs uppercase tracking-wide text-fg-subtle">Notes</span>
            {#if vault.path}
              <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onclick={() => (ui.creating = "folder")}
                  title="New folder"
                  aria-label="New folder"
                  class="text-fg-subtle hover:text-fg"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4">
                    <path
                      d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"
                      stroke-linejoin="round"
                    />
                    <path d="M12 11v4M10 13h4" stroke-linecap="round" />
                  </svg>
                </button>
                <button
                  onclick={() => (ui.creating = "note")}
                  title="New note"
                  aria-label="New note"
                  class="text-fg-subtle hover:text-fg"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4">
                    <path
                      d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z"
                      stroke-linejoin="round"
                    />
                    <path d="M14 3v5h5M12 12v6M9 15h6" stroke-linecap="round" />
                  </svg>
                </button>
              </div>
            {/if}
          </div>
          {#if ui.creating === "folder"}
            <CreateInput
              placeholder="folder or path/to/folder"
              onSubmit={handleCreateNoteFolder}
              onCancel={() => (ui.creating = null)}
            />
          {:else if ui.creating === "note"}
            <CreateInput
              placeholder="note.md or path/to/note"
              onSubmit={handleCreateNote}
              onCancel={() => (ui.creating = null)}
            />
          {/if}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            ondragover={onNotesRootDragOver}
            ondrop={onNotesRootDrop}
            class="flex-1 min-h-[2rem] {ui.notesDrag ? 'rounded outline-dashed outline-1 outline-fg-faint/30' : ''}"
          >
            {#if !vault.path}
              <div class="px-2 py-1 text-fg-faint italic">No vault loaded</div>
            {:else if !notes.isLoaded}
              <div class="px-2 py-1 text-fg-faint italic">Loading…</div>
            {:else if notes.error}
              <div class="px-2 py-1 text-red-400 text-xs">{notes.error}</div>
            {:else if notes.tree.length === 0}
              <div class="px-2 py-1 text-fg-faint italic">No notes yet</div>
            {:else}
              <NotesTree nodes={notes.tree} bind:expanded={notesExpanded} />
            {/if}
          </div>
        </div>
      </nav>
    </aside>
    <main class="flex-1 overflow-auto flex flex-col min-w-0">
      {@render children()}
    </main>
  </div>

  {#if ui.terminalOpen}
    <section
      class="shrink-0 border-t border-border bg-surface-deep text-fg font-mono text-sm flex flex-col"
      style="height: {settings.terminalHeight}px"
    >
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div
        role="separator"
        aria-orientation="horizontal"
        onmousedown={startTerminalResize}
        class="h-1 -mt-0.5 cursor-ns-resize hover:bg-surface-3 shrink-0"
      ></div>
      <div class="flex items-center justify-between px-3 py-1 border-b border-border text-xs text-fg-subtle">
        <span>Terminal</span>
        <button
          onclick={() => (ui.terminalOpen = false)}
          class="hover:text-fg"
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

<CommandPalette />
<SearchOverlay />
<NewReminderDialog />

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
