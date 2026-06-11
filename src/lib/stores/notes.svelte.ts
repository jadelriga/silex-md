import { vaultApi, type VaultEntry } from "$lib/api/vault";
import { vault } from "$lib/stores/vault.svelte";
import { buildNoteTree, type NoteTreeNode } from "$lib/utils/notePath";
import { EntryStore } from "./entryStore.svelte";

class NotesStore extends EntryStore {
  folders = $state<string[]>([]);

  tree = $derived.by<NoteTreeNode[]>(() => {
    if (!vault.path) return [];
    return buildNoteTree(Array.from(this.entries.values()), vault.path, this.folders);
  });

  constructor() {
    super("note");
  }

  protected async refreshEntries(vaultPath: string) {
    const [, folders] = await Promise.all([
      super.refreshEntries(vaultPath),
      vaultApi.listNoteFolders(vaultPath),
    ]);
    this.folders = folders;
  }

  protected clear() {
    super.clear();
    this.folders = [];
  }

  async refreshFolders() {
    if (!vault.path) return;
    try {
      this.folders = await vaultApi.listNoteFolders(vault.path);
    } catch (e) {
      console.error("notes.refreshFolders failed", e);
    }
  }

  /**
   * Rewrite every cached entry whose path lives under `oldAbs/` to live
   * under `newAbs/`. The watcher doesn't fire per-file events for a
   * directory rename on macOS (FSEvents reports at the directory level
   * and we filter to `.md` paths), so the caller — typically the rename
   * UI itself — has to repaint our local state in lockstep with the
   * filesystem rename.
   */
  renameFolderPath(oldAbs: string, newAbs: string) {
    const oldPrefix = oldAbs.endsWith("/") ? oldAbs : oldAbs + "/";
    const newPrefix = newAbs.endsWith("/") ? newAbs : newAbs + "/";
    const updates: VaultEntry[] = [];
    const removes: string[] = [];
    for (const [path, entry] of this.entries) {
      if (path.startsWith(oldPrefix)) {
        removes.push(path);
        updates.push({ ...entry, path: newPrefix + path.slice(oldPrefix.length) });
      }
    }
    for (const p of removes) this.entries.delete(p);
    for (const e of updates) this.entries.set(e.path, e);
  }
}

export const notes = new NotesStore();
