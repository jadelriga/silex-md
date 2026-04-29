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

export interface BoardLayout {
  name: string;
  columns: string[];
}

export const vaultApi = {
  readVault(path: string): Promise<VaultEntry[]> {
    return invoke("read_vault", { path });
  },
  readEntry(vaultPath: string, path: string): Promise<VaultEntry | null> {
    return invoke("read_entry", { vaultPath, path });
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
  watchVault(path: string): Promise<void> {
    return invoke("watch_vault", { path });
  },
  listBoards(vaultPath: string): Promise<BoardLayout[]> {
    return invoke("list_boards", { vaultPath });
  },
  readBodies(vaultPath: string): Promise<Record<string, string>> {
    return invoke("read_bodies", { vaultPath });
  },
  createBoard(vaultPath: string, name: string): Promise<string> {
    return invoke("create_board", { vaultPath, name });
  },
  createNoteFolder(vaultPath: string, relativePath: string): Promise<string> {
    return invoke("create_note_folder", { vaultPath, relativePath });
  },
  createNote(vaultPath: string, relativePath: string): Promise<string> {
    return invoke("create_note", { vaultPath, relativePath });
  },
};
