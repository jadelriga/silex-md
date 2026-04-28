import { tasks } from "$lib/stores/tasks.svelte";

export interface Board {
  name: string;
  columns: string[];
}

class BoardsStore {
  list = $derived.by<Board[]>(() => {
    const map = new Map<string, Set<string>>();
    for (const entry of tasks.entries.values()) {
      if (!entry.board || !entry.column) continue;
      if (!map.has(entry.board)) map.set(entry.board, new Set());
      map.get(entry.board)!.add(entry.column);
    }
    return Array.from(map.entries())
      .map(([name, cols]) => ({ name, columns: Array.from(cols).sort() }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });
}

export const boards = new BoardsStore();
