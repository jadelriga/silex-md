import { SvelteMap } from "svelte/reactivity";
import { vaultApi, type VaultEntry } from "$lib/api/vault";

class RemindersStore {
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
        if (entry.kind === "reminder") {
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

  upsert(entry: VaultEntry) {
    if (entry.kind === "reminder") this.entries.set(entry.path, entry);
  }

  remove(path: string) {
    this.entries.delete(path);
  }
}

export const reminders = new RemindersStore();
