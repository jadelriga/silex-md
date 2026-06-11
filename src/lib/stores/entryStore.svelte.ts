import { SvelteMap } from "svelte/reactivity";
import { vaultApi, type EntryKind, type VaultEntry } from "$lib/api/vault";
import { vault } from "$lib/stores/vault.svelte";
import { writeHashes } from "$lib/stores/writeHashes";
import { bodies } from "$lib/stores/bodies.svelte";
import { sha256Hex } from "$lib/utils/hash";

/**
 * Reactive cache of vault entries of a single kind. Tasks, notes and
 * reminders are the same store with a different `kind` filter; subclasses
 * that carry extra state extend the `refreshEntries`/`clear` hooks so the
 * load lifecycle (isLoaded/error) stays in one place.
 */
export class EntryStore {
  entries = new SvelteMap<string, VaultEntry>();
  isLoaded = $state(false);
  error = $state<string | null>(null);
  readonly kind: EntryKind;

  constructor(kind: EntryKind) {
    this.kind = kind;
  }

  async loadFromVault(vaultPath: string) {
    this.isLoaded = false;
    this.error = null;
    try {
      await this.refreshEntries(vaultPath);
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      this.clear();
    } finally {
      this.isLoaded = true;
    }
  }

  protected async refreshEntries(vaultPath: string) {
    const all = await vaultApi.readVault(vaultPath);
    this.entries.clear();
    for (const entry of all) {
      if (entry.kind === this.kind) {
        this.entries.set(entry.path, entry);
      }
    }
  }

  protected clear() {
    this.entries.clear();
  }

  /** Hash-registered atomic write, then refresh the entry and cached body. */
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
    if (entry.kind === this.kind) this.entries.set(entry.path, entry);
  }

  remove(path: string) {
    this.entries.delete(path);
  }
}
