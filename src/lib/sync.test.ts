import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
vi.mock("@tauri-apps/plugin-store", () => ({ load: vi.fn() }));

import { handleVaultChange } from "./sync";
import { tasks } from "./stores/tasks.svelte";
import { writeHashes } from "./stores/writeHashes";
import { vault } from "./stores/vault.svelte";
import { vaultApi, type VaultEntry } from "./api/vault";

const TASK_PATH = "/vault/boards/my-board/backlog/task.md";

function makeEntry(overrides: Partial<VaultEntry> = {}): VaultEntry {
  return {
    path: TASK_PATH,
    kind: "task",
    board: "my-board",
    column: "backlog",
    frontmatter: {},
    subtaskTotal: 0,
    subtaskDone: 0,
    ...overrides,
  };
}

beforeEach(() => {
  tasks.entries.clear();
  tasks.error = null;
  tasks.isLoaded = true;
  writeHashes.clear();
  vault.path = "/vault";
  vault.isLoaded = true;
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("handleVaultChange", () => {
  it("removes the entry on a removed event", async () => {
    tasks.upsert(makeEntry());
    expect(tasks.entries.size).toBe(1);

    await handleVaultChange({ path: TASK_PATH, hash: null, kind: "removed" });

    expect(tasks.entries.size).toBe(0);
  });

  it("clears the registered hash on a removed event", async () => {
    writeHashes.set(TASK_PATH, "hash-abc");
    await handleVaultChange({ path: TASK_PATH, hash: null, kind: "removed" });
    expect(writeHashes.get(TASK_PATH)).toBeUndefined();
  });

  it("ignores own writes when the hash matches the registered one", async () => {
    writeHashes.set(TASK_PATH, "hash-abc");
    const readEntry = vi.spyOn(vaultApi, "readEntry");

    await handleVaultChange({ path: TASK_PATH, hash: "hash-abc", kind: "modified" });

    expect(readEntry).not.toHaveBeenCalled();
  });

  it("treats a different hash as an external change and refreshes the entry", async () => {
    writeHashes.set(TASK_PATH, "hash-abc");
    const updated = makeEntry({ frontmatter: { title: "after external edit" } });
    vi.spyOn(vaultApi, "readEntry").mockResolvedValue(updated);

    await handleVaultChange({ path: TASK_PATH, hash: "hash-different", kind: "modified" });

    expect(tasks.entries.get(TASK_PATH)).toEqual(updated);
  });

  it("upserts the entry on a created event", async () => {
    const created = makeEntry();
    vi.spyOn(vaultApi, "readEntry").mockResolvedValue(created);

    await handleVaultChange({ path: TASK_PATH, hash: "fresh", kind: "created" });

    expect(tasks.entries.get(TASK_PATH)).toEqual(created);
  });

  it("does nothing when no vault is loaded and the event is not a removal", async () => {
    vault.path = null;
    const readEntry = vi.spyOn(vaultApi, "readEntry");

    await handleVaultChange({ path: TASK_PATH, hash: "h", kind: "modified" });

    expect(readEntry).not.toHaveBeenCalled();
  });

  it("swallows errors from readEntry instead of throwing", async () => {
    vi.spyOn(vaultApi, "readEntry").mockRejectedValue(new Error("boom"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      handleVaultChange({ path: TASK_PATH, hash: "x", kind: "modified" }),
    ).resolves.toBeUndefined();

    expect(errSpy).toHaveBeenCalled();
  });
});

describe("tasks.save", () => {
  it("writes the file, registers the returned hash, and refreshes the entry", async () => {
    const writeSpy = vi.spyOn(vaultApi, "writeTask").mockResolvedValue("hash-saved");
    const refreshed = makeEntry({ frontmatter: { title: "saved" } });
    vi.spyOn(vaultApi, "readEntry").mockResolvedValue(refreshed);

    await tasks.save(TASK_PATH, "file content");

    expect(writeSpy).toHaveBeenCalledWith(TASK_PATH, "file content");
    expect(writeHashes.get(TASK_PATH)).toBe("hash-saved");
    expect(tasks.entries.get(TASK_PATH)).toEqual(refreshed);
  });

  it("registered hash from save() makes a subsequent watcher event a no-op", async () => {
    vi.spyOn(vaultApi, "writeTask").mockResolvedValue("hash-saved");
    vi.spyOn(vaultApi, "readEntry").mockResolvedValue(makeEntry());

    await tasks.save(TASK_PATH, "file content");

    const readEntry = vi.spyOn(vaultApi, "readEntry");
    readEntry.mockClear();

    await handleVaultChange({ path: TASK_PATH, hash: "hash-saved", kind: "modified" });

    expect(readEntry).not.toHaveBeenCalled();
  });
});
