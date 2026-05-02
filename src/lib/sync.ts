import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { vaultApi } from "$lib/api/vault";
import { tasks } from "$lib/stores/tasks.svelte";
import { notes } from "$lib/stores/notes.svelte";
import { reminders } from "$lib/stores/reminders.svelte";
import { boards } from "$lib/stores/boards.svelte";
import { bodies } from "$lib/stores/bodies.svelte";
import { writeHashes } from "$lib/stores/writeHashes";
import { vault } from "$lib/stores/vault.svelte";
import { syncEvents } from "$lib/stores/syncEvents.svelte";

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
    notes.remove(path);
    reminders.remove(path);
    bodies.invalidate(path);
    if (vault.path) boards.load(vault.path);
    return;
  }

  if (hash && writeHashes.matches(path, hash)) {
    return;
  }

  if (!vault.path) return;

  try {
    const entry = await vaultApi.readEntry(vault.path, path);
    if (entry) {
      if (entry.kind === "task") tasks.upsert(entry);
      else if (entry.kind === "note") notes.upsert(entry);
      else if (entry.kind === "reminder") reminders.upsert(entry);
      if (bodies.isLoaded) void bodies.refresh(path);
    } else {
      // File no longer exists at this path (e.g. rename source on macOS reports
      // Modify(Name) for both old and new paths; the old path's read returns
      // null). Treat as a removal.
      tasks.remove(path);
      notes.remove(path);
      reminders.remove(path);
      bodies.invalidate(path);
    }
    boards.load(vault.path);
    syncEvents.externalChange = { path, ts: Date.now() };
  } catch (e) {
    console.error("Failed to refresh entry", path, e);
  }
}

export function startSync(): Promise<UnlistenFn> {
  return listen<VaultChangeEvent>("vault:changed", (event) => {
    handleVaultChange(event.payload);
  });
}
