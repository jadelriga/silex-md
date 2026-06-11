<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { ask } from "@tauri-apps/plugin-dialog";
  import { ui } from "$lib/stores/ui.svelte";
  import { vault } from "$lib/stores/vault.svelte";
  import { tasks } from "$lib/stores/tasks.svelte";
  import { boards } from "$lib/stores/boards.svelte";
  import { notes } from "$lib/stores/notes.svelte";
  import { reminders } from "$lib/stores/reminders.svelte";
  import { vaultApi } from "$lib/api/vault";
  import { confirm } from "$lib/stores/confirm.svelte";
  import { withContextMenu } from "$lib/utils/contextMenu";
  import { noteHref, noteRelativePath } from "$lib/utils/notePath";
  import { activeBoardFromPathname, basename } from "$lib/utils/routes";
  import NotesTree from "./NotesTree.svelte";
  import RemindersTree from "./RemindersTree.svelte";
  import CreateInput from "./CreateInput.svelte";
  import RenameInput from "./RenameInput.svelte";

  let notesExpanded = $state(new Set<string>());
  let renamingBoard = $state<string | null>(null);

  const activeBoard = $derived(activeBoardFromPathname(page.url.pathname));

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

  function deleteBoard(boardName: string) {
    if (!vault.path) return;
    const boardPath = `${vault.path}/boards/${boardName}`;
    confirm.ask({
      title: `Delete board "${boardName}"?`,
      message: `This will move the entire board, including all its columns and cards, to the Trash. You can restore it from there if needed.`,
      confirmLabel: "Move to Trash",
      danger: true,
      onConfirm: async () => {
        await vaultApi.deletePath(boardPath);
        if (vault.path) await boards.load(vault.path);
      },
    });
  }

  async function handleRenameBoard(oldName: string, newName: string) {
    if (!vault.path) return;
    if (newName.includes("/") || newName.includes("..")) {
      throw new Error("Board name cannot contain '/' or '..'");
    }
    const from = `${vault.path}/boards/${oldName}`;
    const to = `${vault.path}/boards/${newName}`;
    if (from === to) {
      renamingBoard = null;
      return;
    }
    await vaultApi.movePath(from, to);
    renamingBoard = null;
    if (vault.path) {
      await boards.load(vault.path);
      await tasks.loadFromVault(vault.path);
    }
    if (activeBoard === oldName) {
      goto(`/boards/${encodeURIComponent(newName)}`);
    }
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

<aside class="w-60 shrink-0 border-r border-border bg-surface-1 flex flex-col">
  <div class="px-4 py-3 border-b border-border">
    <a
      href="/"
      class="block text-sm font-semibold tracking-wide text-fg hover:text-fg-muted"
      title="Home"
    >Silex</a>
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
          {#if renamingBoard === board.name}
            <RenameInput
              initialValue={board.name}
              placeholder="board name"
              onSubmit={(v) => handleRenameBoard(board.name, v)}
              onCancel={() => (renamingBoard = null)}
            />
          {:else}
            <a
              href="/boards/{encodeURIComponent(board.name)}"
              use:withContextMenu={() => [
                {
                  label: "Rename…",
                  action: () => {
                    renamingBoard = board.name;
                  },
                },
                { label: "Delete board…", danger: true, action: () => deleteBoard(board.name) },
              ]}
              class="block px-2 py-1 rounded truncate {activeBoard === board.name
                ? 'bg-surface-2 text-fg'
                : 'text-fg hover:bg-surface-2/60'}"
              title={board.name}
            >
              {board.name}
            </a>
          {/if}
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
