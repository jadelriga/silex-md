import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { vaultApi } from "$lib/api/vault";
import { tasks } from "$lib/stores/tasks.svelte";
import { writeHashes } from "$lib/stores/writeHashes";
import { vault } from "$lib/stores/vault.svelte";

export type VaultChangeKind = "created" | "modified" | "removed";

export interface VaultChangeEvent {
  path: string;
  hash: string | null;
  kind: VaultChangeKind;
}

export async function handleVaultChange(change: VaultChangeEvent): Promise<void> {
  const { path, hash, kind } = change;

  if (kind === "removed") {
    writeHashes.delete(path);
    tasks.remove(path);
    return;
  }

  if (hash && writeHashes.matches(path, hash)) {
    return;
  }

  if (!vault.path) return;

  try {
    const entry = await vaultApi.readEntry(vault.path, path);
    if (entry) tasks.upsert(entry);
  } catch (e) {
    console.error("Failed to refresh entry", path, e);
  }
}

export function startSync(): Promise<UnlistenFn> {
  return listen<VaultChangeEvent>("vault:changed", (event) => {
    handleVaultChange(event.payload);
  });
}
