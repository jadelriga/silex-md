import { SvelteMap } from "svelte/reactivity";
import { vaultApi, type VaultEntry } from "$lib/api/vault";
import { vault } from "$lib/stores/vault.svelte";
import { writeHashes } from "$lib/stores/writeHashes";
import { bodies } from "$lib/stores/bodies.svelte";
import { sha256Hex } from "$lib/utils/hash";
import { buildNoteTree, type NoteTreeNode } from "$lib/utils/notePath";

class NotesStore {
  entries = new SvelteMap<string, VaultEntry>();
  folders = $state<string[]>([]);
  isLoaded = $state(false);
  error = $state<string | null>(null);

  tree = $derived.by<NoteTreeNode[]>(() => {
    if (!vault.path) return [];
    return buildNoteTree(Array.from(this.entries.values()), vault.path, this.folders);
  });

  async loadFromVault(vaultPath: string) {
    this.isLoaded = false;
    this.error = null;
    try {
      const [all, folders] = await Promise.all([
        vaultApi.readVault(vaultPath),
        vaultApi.listNoteFolders(vaultPath),
      ]);
      this.entries.clear();
      for (const entry of all) {
        if (entry.kind === "note") {
          this.entries.set(entry.path, entry);
        }
      }
      this.folders = folders;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      this.entries.clear();
      this.folders = [];
    } finally {
      this.isLoaded = true;
    }
  }

  async refreshFolders() {
    if (!vault.path) return;
    try {
      this.folders = await vaultApi.listNoteFolders(vault.path);
    } catch (e) {
      console.error("notes.refreshFolders failed", e);
    }
  }

  async save(path: string, content: string) {
    const hash = await sha256Hex(content);
    writeHashes.set(path, hash);
    await vaultApi.writeTask(path, content);
    if (vault.path) {
      const entry = await vaultApi.readEntry(vault.path, path);
      if (entry) this.upsert(entry);
    }
    if (bodies.isLoaded) void bodies.refresh(path);
  }

  upsert(entry: VaultEntry) {
    if (entry.kind === "note") this.entries.set(entry.path, entry);
  }

  remove(path: string) {
    this.entries.delete(path);
  }
}

export const notes = new NotesStore();
