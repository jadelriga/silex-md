<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import {
    noteHref,
    noteRelativePath,
    decodeNoteRouteParam,
    type NoteTreeNode,
  } from "$lib/utils/notePath";
  import { ui } from "$lib/stores/ui.svelte";
  import { vault } from "$lib/stores/vault.svelte";
  import { notes } from "$lib/stores/notes.svelte";
  import { bodies } from "$lib/stores/bodies.svelte";
  import { vaultApi } from "$lib/api/vault";
  import { ask } from "@tauri-apps/plugin-dialog";
  import { confirm } from "$lib/stores/confirm.svelte";
  import { withContextMenu } from "$lib/utils/contextMenu";
  import RenameInput from "./RenameInput.svelte";
  import Self from "./NotesTree.svelte";

  let {
    nodes,
    expanded = $bindable(new Set<string>()),
    depth = 0,
  }: {
    nodes: NoteTreeNode[];
    expanded?: Set<string>;
    depth?: number;
  } = $props();

  let renamingPath = $state<string | null>(null);

  const activeRelativePath = $derived(
    page.url.pathname.startsWith("/notes/")
      ? decodeNoteRouteParam(page.url.pathname.slice("/notes/".length))
      : null,
  );

  function toggle(path: string) {
    if (expanded.has(path)) expanded.delete(path);
    else expanded.add(path);
    expanded = new Set(expanded);
  }

  function onFileDragStart(e: DragEvent, node: NoteTreeNode) {
    if (node.type !== "file") return;
    ui.notesDrag = { path: node.absolutePath, relativePath: node.relativePath };
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", node.absolutePath);
    }
  }

  function onFileDragEnd() {
    ui.notesDrag = null;
    ui.notesDragOver = null;
  }

  function onFolderDragOver(e: DragEvent, folderPath: string) {
    if (!ui.notesDrag) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    ui.notesDragOver = folderPath;
  }

  function onFolderDragLeave(folderPath: string) {
    if (ui.notesDragOver === folderPath) ui.notesDragOver = null;
  }

  async function onFolderDrop(e: DragEvent, folderPath: string) {
    e.preventDefault();
    e.stopPropagation();
    const drag = ui.notesDrag;
    ui.notesDrag = null;
    ui.notesDragOver = null;
    if (!drag || !vault.path) return;
    const filename = drag.path.split("/").pop()!;
    const newPath = `${vault.path}/${folderPath}/${filename}`;
    if (newPath === drag.path) return;
    await tryMoveWithConflict(drag.path, newPath);
  }

  function deleteNoteFile(node: { absolutePath: string; name: string }) {
    confirm.ask({
      title: `Delete note "${node.name}"?`,
      message: "The file will be moved to the Trash. You can restore it from there.",
      confirmLabel: "Move to Trash",
      danger: true,
      onConfirm: async () => {
        await vaultApi.deletePath(node.absolutePath);
      },
    });
  }

  async function renameNoteFile(
    node: { absolutePath: string; relativePath: string },
    rawNewName: string,
  ) {
    if (!vault.path) return;
    const trimmed = rawNewName.trim();
    if (trimmed.includes("/") || trimmed.includes("..")) {
      throw new Error("Name cannot contain '/' or '..'");
    }
    const baseName = trimmed.endsWith(".md") ? trimmed : `${trimmed}.md`;
    const oldAbs = node.absolutePath;
    const parentSegments = oldAbs.split("/").slice(0, -1);
    const newAbs = [...parentSegments, baseName].join("/");
    if (newAbs === oldAbs) {
      renamingPath = null;
      return;
    }
    await vaultApi.movePath(oldAbs, newAbs);
    renamingPath = null;
    if (activeRelativePath === node.relativePath) {
      const newRel = noteRelativePath(newAbs, vault.path);
      goto(noteHref(newRel));
    }
  }

  async function renameNoteFolder(
    node: { relativePath: string; name: string },
    rawNewName: string,
  ) {
    if (!vault.path) return;
    const trimmed = rawNewName.trim();
    if (trimmed.includes("/") || trimmed.includes("..")) {
      throw new Error("Name cannot contain '/' or '..'");
    }
    const oldRel = node.relativePath;
    const oldAbs = `${vault.path}/${oldRel}`;
    const parentSegments = oldRel.split("/").slice(0, -1);
    const newRel = [...parentSegments, trimmed].join("/");
    const newAbs = `${vault.path}/${newRel}`;
    if (newAbs === oldAbs) {
      renamingPath = null;
      return;
    }
    await vaultApi.movePath(oldAbs, newAbs);
    renamingPath = null;

    // FSEvents on macOS doesn't fire per-file events for a directory
    // rename, and our watcher filters to .md paths anyway, so repaint
    // the entries map + body cache + expanded set ourselves to keep the
    // tree in sync with disk.
    notes.renameFolderPath(oldAbs, newAbs);
    bodies.renameFolderPath(oldAbs, newAbs);
    const oldRelPrefix = `${oldRel}/`;
    const newRelPrefix = `${newRel}/`;
    const remappedExpanded = new Set<string>();
    for (const p of expanded) {
      if (p === oldRel) remappedExpanded.add(newRel);
      else if (p.startsWith(oldRelPrefix))
        remappedExpanded.add(newRelPrefix + p.slice(oldRelPrefix.length));
      else remappedExpanded.add(p);
    }
    expanded = remappedExpanded;

    await notes.refreshFolders();
    if (activeRelativePath && activeRelativePath.startsWith(oldRelPrefix)) {
      const movedActiveRel = newRel + activeRelativePath.slice(oldRel.length);
      goto(noteHref(movedActiveRel));
    }
  }

  function deleteNoteFolder(node: { relativePath: string; name: string }) {
    if (!vault.path) return;
    const absolute = `${vault.path}/${node.relativePath}`;
    confirm.ask({
      title: `Delete folder "${node.name}"?`,
      message: `The entire folder and any notes inside will be moved to the Trash.`,
      confirmLabel: "Move to Trash",
      danger: true,
      onConfirm: async () => {
        await vaultApi.deletePath(absolute);
        await notes.refreshFolders();
      },
    });
  }

  async function tryMoveWithConflict(from: string, to: string) {
    try {
      await vaultApi.movePath(from, to);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.startsWith("DestinationExists")) {
        const replace = await ask(`A file already exists at:\n${to}\n\nReplace it?`, {
          title: "Replace file?",
          kind: "warning",
          okLabel: "Replace",
          cancelLabel: "Cancel",
        });
        if (replace) {
          try {
            await vaultApi.movePath(from, to, true);
          } catch (err2) {
            console.error("Failed to move (with overwrite)", err2);
          }
        }
      } else {
        console.error("Failed to move note", err);
      }
    }
  }
</script>

{#each nodes as node (node.relativePath)}
  {#if node.type === "folder"}
    {#if renamingPath === node.relativePath}
      <div style="padding-left: {depth * 0.75}rem">
        <RenameInput
          initialValue={node.name}
          placeholder="folder name"
          onSubmit={(v) => renameNoteFolder(node, v)}
          onCancel={() => (renamingPath = null)}
        />
      </div>
    {:else}
      <button
        type="button"
        onclick={() => toggle(node.relativePath)}
        ondragover={(e) => onFolderDragOver(e, node.relativePath)}
        ondragleave={() => onFolderDragLeave(node.relativePath)}
        ondrop={(e) => onFolderDrop(e, node.relativePath)}
        use:withContextMenu={() => [
          {
            label: "Rename…",
            action: () => {
              renamingPath = node.relativePath;
            },
          },
          { label: "Delete folder…", danger: true, action: () => deleteNoteFolder(node) },
        ]}
        class="w-full text-left px-2 py-0.5 rounded text-fg-muted hover:bg-surface-2/60 truncate flex items-center gap-1 {ui.notesDragOver ===
        node.relativePath
          ? 'bg-surface-2 ring-1 ring-fg-faint'
          : ''}"
        style="padding-left: {0.5 + depth * 0.75}rem"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          class="w-4 h-4 shrink-0 text-fg-muted transition-transform {expanded.has(
            node.relativePath,
          )
            ? 'rotate-90'
            : ''}"
        >
          <path d="M9 6 L15 12 L9 18" />
        </svg>
        <span class="truncate">{node.name}</span>
      </button>
    {/if}
    {#if expanded.has(node.relativePath)}
      <Self nodes={node.children} bind:expanded depth={depth + 1} />
    {/if}
  {:else if renamingPath === node.relativePath}
    <div style="padding-left: {(depth + 1) * 0.75}rem">
      <RenameInput
        initialValue={node.name}
        placeholder="note name"
        onSubmit={(v) => renameNoteFile(node, v)}
        onCancel={() => (renamingPath = null)}
      />
    </div>
  {:else}
    <a
      href={noteHref(node.relativePath)}
      draggable="true"
      ondragstart={(e) => onFileDragStart(e, node)}
      ondragend={onFileDragEnd}
      ondragover={(e) => {
        if (ui.notesDrag) e.preventDefault();
      }}
      use:withContextMenu={() => [
        {
          label: "Rename…",
          action: () => {
            renamingPath = node.relativePath;
          },
        },
        { label: "Delete note…", danger: true, action: () => deleteNoteFile(node) },
      ]}
      class="block px-2 py-0.5 rounded truncate {activeRelativePath === node.relativePath
        ? 'bg-surface-2 text-fg'
        : 'text-fg hover:bg-surface-2/60'}"
      style="padding-left: {0.5 + (depth + 1) * 0.75}rem"
      title={node.relativePath}
    >
      {node.name}
    </a>
  {/if}
{/each}
