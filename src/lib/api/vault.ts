import { invoke } from "@tauri-apps/api/core";

export type EntryKind = "task" | "note" | "reminder";

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
  moveTask(from: string, to: string, overwrite = false): Promise<void> {
    return invoke("move_task", { from, to, overwrite });
  },
  movePath(from: string, to: string, overwrite = false): Promise<void> {
    return invoke("move_task", { from, to, overwrite });
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
  listNoteFolders(vaultPath: string): Promise<string[]> {
    return invoke("list_note_folders", { vaultPath });
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
  createColumn(vaultPath: string, boardName: string, columnName: string): Promise<void> {
    return invoke("create_column", { vaultPath, boardName, columnName });
  },
  setBoardColumnOrder(
    vaultPath: string,
    boardName: string,
    columns: string[],
  ): Promise<void> {
    return invoke("set_board_column_order", { vaultPath, boardName, columns });
  },
  createReminder(vaultPath: string, title: string, reminder: string): Promise<string> {
    return invoke("create_reminder", { vaultPath, title, reminder });
  },
  createTask(
    vaultPath: string,
    boardName: string,
    columnName: string,
    title: string,
    order?: string,
  ): Promise<string> {
    return invoke("create_task", {
      vaultPath,
      boardName,
      columnName,
      title,
      order: order ?? null,
    });
  },
};
