import { SvelteMap } from "svelte/reactivity";
import { vaultApi, type VaultEntry } from "$lib/api/vault";
import { vault } from "$lib/stores/vault.svelte";
import { writeHashes } from "$lib/stores/writeHashes";
import { bodies } from "$lib/stores/bodies.svelte";
import { sha256Hex } from "$lib/utils/hash";
import { buildNoteTree, type NoteTreeNode } from "$lib/utils/notePath";

class NotesStore {
  entries = new SvelteMap<string, VaultEntry>();
  isLoaded = $state(false);
  error = $state<string | null>(null);

  tree = $derived.by<NoteTreeNode[]>(() => {
    if (!vault.path) return [];
    return buildNoteTree(Array.from(this.entries.values()), vault.path);
  });

  async loadFromVault(vaultPath: string) {
    this.isLoaded = false;
    this.error = null;
    try {
      const all = await vaultApi.readVault(vaultPath);
      this.entries.clear();
      for (const entry of all) {
        if (entry.kind === "note") {
          this.entries.set(entry.path, entry);
        }
      }
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      this.entries.clear();
    } finally {
      this.isLoaded = true;
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
