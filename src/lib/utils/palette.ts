import type { VaultEntry, BoardLayout } from "$lib/api/vault";
import { noteRelativePath, noteHref } from "$lib/utils/notePath";

export type PaletteItemKind = "board" | "note" | "task" | "action";
export type PaletteCategory = "navigation" | "command";

export interface PaletteItem {
  id: string;
  kind: PaletteItemKind;
  category: PaletteCategory;
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
  setThemePref?: (pref: "system" | "light" | "dark") => void;
  startCreating?: (kind: "board" | "note" | "folder") => void;
  openNewReminder?: () => void;
  openSettings?: () => void;
  revealSettings?: () => void;
}

export function buildPaletteItems(s: PaletteSources): PaletteItem[] {
  const items: PaletteItem[] = [];

  // Navigation: boards
  for (const board of s.boards) {
    items.push({
      id: `board:${board.name}`,
      kind: "board",
      category: "navigation",
      label: board.name,
      hint: `${board.columns.length} column${board.columns.length === 1 ? "" : "s"}`,
      search: `board ${board.name}`,
      run: () => s.goto(`/boards/${encodeURIComponent(board.name)}`),
    });
  }

  // Navigation: tasks
  for (const task of s.tasks) {
    const fm = (task.frontmatter ?? {}) as Record<string, unknown>;
    const fileName = task.path.split("/").pop()?.replace(/\.md$/, "") ?? "";
    const title = (fm.title as string) ?? fileName;
    const tags = ((fm.tags as string[] | undefined) ?? []).join(" ");
    items.push({
      id: `task:${task.path}`,
      kind: "task",
      category: "navigation",
      label: title,
      hint: `${task.board ?? ""}${task.column ? ` / ${task.column}` : ""}`,
      search: `task ${title} ${task.board ?? ""} ${task.column ?? ""} ${tags}`,
      run: () => s.openTask(task.path),
    });
  }

  // Navigation: notes
  if (s.vaultPath) {
    for (const note of s.notes) {
      const rel = noteRelativePath(note.path, s.vaultPath);
      const fm = (note.frontmatter ?? {}) as Record<string, unknown>;
      const title = (fm.title as string) ?? rel.replace(/\.md$/, "");
      items.push({
        id: `note:${note.path}`,
        kind: "note",
        category: "navigation",
        label: title,
        hint: rel,
        search: `note ${title} ${rel}`,
        run: () => s.goto(noteHref(rel)),
      });
    }
  }

  // Command: go to calendar
  items.push({
    id: "action:calendar",
    kind: "action",
    category: "command",
    label: "Go to calendar",
    search: "go to calendar action",
    run: () => s.goto("/calendar"),
  });

  // Command: terminal toggle
  items.push({
    id: "action:terminal",
    kind: "action",
    category: "command",
    label: "Toggle terminal panel",
    hint: "⌘J",
    search: "toggle terminal panel action",
    run: () => s.toggleTerminal(),
  });

  // Command: create flows
  if (s.startCreating) {
    const startCreating = s.startCreating;
    items.push({
      id: "action:new-board",
      kind: "action",
      category: "command",
      label: "New board…",
      search: "new board create action",
      run: () => startCreating("board"),
    });
    items.push({
      id: "action:new-note",
      kind: "action",
      category: "command",
      label: "New note…",
      search: "new note create action",
      run: () => startCreating("note"),
    });
    items.push({
      id: "action:new-folder",
      kind: "action",
      category: "command",
      label: "New notes folder…",
      search: "new folder notes create action",
      run: () => startCreating("folder"),
    });
  }

  // Command: new reminder
  if (s.openNewReminder) {
    const openNewReminder = s.openNewReminder;
    items.push({
      id: "action:new-reminder",
      kind: "action",
      category: "command",
      label: "New reminder…",
      search: "new reminder create action",
      run: () => openNewReminder(),
    });
  }

  // Command: open settings
  if (s.openSettings) {
    const openSettings = s.openSettings;
    items.push({
      id: "action:open-settings",
      kind: "action",
      category: "command",
      label: "Open settings…",
      hint: "⌘,",
      search: "open settings preferences action",
      run: () => openSettings(),
    });
  }

  // Command: reveal settings file in Finder
  if (s.revealSettings) {
    const revealSettings = s.revealSettings;
    items.push({
      id: "action:reveal-settings",
      kind: "action",
      category: "command",
      label: "Reveal settings file",
      search: "reveal settings file finder json action",
      run: () => revealSettings(),
    });
  }

  // Command: theme switching
  if (s.setThemePref) {
    const setThemePref = s.setThemePref;
    items.push({
      id: "action:theme-system",
      kind: "action",
      category: "command",
      label: "Theme: Use system",
      search: "theme system action",
      run: () => setThemePref("system"),
    });
    items.push({
      id: "action:theme-light",
      kind: "action",
      category: "command",
      label: "Theme: Light",
      search: "theme light action",
      run: () => setThemePref("light"),
    });
    items.push({
      id: "action:theme-dark",
      kind: "action",
      category: "command",
      label: "Theme: Dark",
      search: "theme dark action",
      run: () => setThemePref("dark"),
    });
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
