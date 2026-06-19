import { vaultApi, type VaultEntry } from "$lib/api/vault";
import { vault } from "$lib/stores/vault.svelte";
import { writeHashes } from "$lib/stores/writeHashes";
import { bodies } from "$lib/stores/bodies.svelte";
import { sha256Hex } from "$lib/utils/hash";

/**
 * Shared write path for editable entries (tasks and notes). Hashes the content
 * and registers it in `writeHashes` BEFORE writing, so the file watcher can
 * dedupe our own write (see `sync.ts`); writes the file atomically; re-reads
 * the parsed entry and hands it to the caller's `upsert`; then refreshes the
 * body cache. `tasks` and `notes` had byte-identical copies of this — keep them
 * in one place so the write/dedup invariant can't drift between the two.
 */
export async function persistEntry(
  path: string,
  content: string,
  upsert: (entry: VaultEntry) => void,
): Promise<void> {
  const hash = await sha256Hex(content);
  writeHashes.set(path, hash);
  await vaultApi.writeTask(path, content);
  if (vault.path) {
    const entry = await vaultApi.readEntry(vault.path, path);
    if (entry) upsert(entry);
  }
  if (bodies.isLoaded) void bodies.refresh(path);
}
