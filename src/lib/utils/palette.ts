import type { VaultEntry, BoardLayout } from "$lib/api/vault";
import { noteRelativePath, noteHref } from "$lib/utils/notePath";

export type PaletteItemKind = "board" | "note" | "task" | "action";

export interface PaletteItem {
  id: string;
  kind: PaletteItemKind;
  label: string;
  hint?: string;
  search: string;
  run: () => void;
}

export interface PaletteSources {
  boards: BoardLayout[];
  notes: VaultEntry[];
  tasks: VaultEntry[];
  vaultPath: string | null;
  goto: (href: string) => void;
  openTask: (path: string) => void;
  toggleTerminal: () => void;
}

export function buildPaletteItems(s: PaletteSources): PaletteItem[] {
  const items: PaletteItem[] = [];

  items.push({
    id: "action:calendar",
    kind: "action",
    label: "Go to calendar",
    search: "go to calendar action",
    run: () => s.goto("/calendar"),
  });

  items.push({
    id: "action:terminal",
    kind: "action",
    label: "Toggle terminal panel",
    hint: "⌘J",
    search: "toggle terminal panel action",
    run: () => s.toggleTerminal(),
  });

  for (const board of s.boards) {
    items.push({
      id: `board:${board.name}`,
      kind: "board",
      label: board.name,
      hint: `${board.columns.length} column${board.columns.length === 1 ? "" : "s"}`,
      search: `board ${board.name}`,
      run: () => s.goto(`/boards/${encodeURIComponent(board.name)}`),
    });
  }

  for (const task of s.tasks) {
    const fm = (task.frontmatter ?? {}) as Record<string, unknown>;
    const fileName = task.path.split("/").pop()?.replace(/\.md$/, "") ?? "";
    const title = (fm.title as string) ?? fileName;
    const tags = ((fm.tags as string[] | undefined) ?? []).join(" ");
    items.push({
      id: `task:${task.path}`,
      kind: "task",
      label: title,
      hint: `${task.board ?? ""}${task.column ? ` / ${task.column}` : ""}`,
      search: `task ${title} ${task.board ?? ""} ${task.column ?? ""} ${tags}`,
      run: () => s.openTask(task.path),
    });
  }

  if (s.vaultPath) {
    for (const note of s.notes) {
      const rel = noteRelativePath(note.path, s.vaultPath);
      const fm = (note.frontmatter ?? {}) as Record<string, unknown>;
      const title = (fm.title as string) ?? rel.replace(/\.md$/, "");
      items.push({
        id: `note:${note.path}`,
        kind: "note",
        label: title,
        hint: rel,
        search: `note ${title} ${rel}`,
        run: () => s.goto(noteHref(rel)),
      });
    }
  }

  return items;
}

export function filterPaletteItems(
  items: PaletteItem[],
  query: string,
  limit = 30,
): PaletteItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items.slice(0, limit);
  const tokens = q.split(/\s+/).filter(Boolean);
  const out: PaletteItem[] = [];
  for (const item of items) {
    const haystack = item.search.toLowerCase();
    if (tokens.every((t) => haystack.includes(t))) {
      out.push(item);
      if (out.length >= limit) break;
    }
  }
  return out;
}
