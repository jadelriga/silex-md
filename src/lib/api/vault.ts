import { invoke } from "@tauri-apps/api/core";

export type EntryKind = "task" | "note";

export interface VaultEntry {
  path: string;
  kind: EntryKind;
  board: string | null;
  column: string | null;
  frontmatter: Record<string, unknown> | null;
  subtaskTotal: number;
  subtaskDone: number;
}

export const vaultApi = {
  readVault(path: string): Promise<VaultEntry[]> {
    return invoke("read_vault", { path });
  },
  readTaskBody(path: string): Promise<string> {
    return invoke("read_task_body", { path });
  },
  writeTask(path: string, content: string): Promise<string> {
    return invoke("write_task", { path, content });
  },
  moveTask(from: string, to: string): Promise<void> {
    return invoke("move_task", { from, to });
  },
  deleteTask(path: string): Promise<void> {
    return invoke("delete_task", { path });
  },
};
