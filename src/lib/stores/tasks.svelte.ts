import { SvelteMap } from "svelte/reactivity";
import { vaultApi, type VaultEntry } from "$lib/api/vault";
import { vault } from "$lib/stores/vault.svelte";
import { writeHashes } from "$lib/stores/writeHashes";

class TasksStore {
  entries = new SvelteMap<string, VaultEntry>();
  isLoaded = $state(false);
  error = $state<string | null>(null);

  async loadFromVault(vaultPath: string) {
    this.isLoaded = false;
    this.error = null;
    try {
      const all = await vaultApi.readVault(vaultPath);
      this.entries.clear();
      for (const entry of all) {
        if (entry.kind === "task") {
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
    const hash = await vaultApi.writeTask(path, content);
    writeHashes.set(path, hash);
    if (vault.path) {
      const entry = await vaultApi.readEntry(vault.path, path);
      if (entry) this.upsert(entry);
    }
  }

  upsert(entry: VaultEntry) {
    if (entry.kind === "task") this.entries.set(entry.path, entry);
  }

  remove(path: string) {
    this.entries.delete(path);
  }
}

export const tasks = new TasksStore();
