import { describe, it, expect, vi } from "vitest";
import { buildPaletteItems, filterPaletteItems } from "./palette";
import type { VaultEntry, BoardLayout } from "$lib/api/vault";

function task(path: string, title?: string, board = "b", column = "c"): VaultEntry {
  return {
    path,
    kind: "task",
    board,
    column,
    frontmatter: title === undefined ? {} : { title },
    subtaskTotal: 0,
    subtaskDone: 0,
  };
}

function note(path: string, title?: string): VaultEntry {
  return {
    path,
    kind: "note",
    board: null,
    column: null,
    frontmatter: title === undefined ? {} : { title },
    subtaskTotal: 0,
    subtaskDone: 0,
  };
}

function makeSources(overrides: Partial<Parameters<typeof buildPaletteItems>[0]>) {
  return {
    boards: [] as BoardLayout[],
    notes: [] as VaultEntry[],
    tasks: [] as VaultEntry[],
    vaultPath: "/vault",
    goto: vi.fn(),
    openTask: vi.fn(),
    toggleTerminal: vi.fn(),
    ...overrides,
  };
}

describe("buildPaletteItems", () => {
  it("always includes the calendar and terminal actions", () => {
    const items = buildPaletteItems(makeSources({}));
    expect(items.map((i) => i.id)).toEqual(
      expect.arrayContaining(["action:calendar", "action:terminal"]),
    );
  });

  it("emits one entry per board with column count hint", () => {
    const boards = [{ name: "alpha", columns: ["a", "b"] }];
    const items = buildPaletteItems(makeSources({ boards }));
    const board = items.find((i) => i.id === "board:alpha");
    expect(board?.label).toBe("alpha");
    expect(board?.hint).toBe("2 columns");
  });

  it("uses task title from frontmatter, falling back to filename", () => {
    const tasks = [
      task("/v/boards/b/c/with-title.md", "Custom title"),
      task("/v/boards/b/c/no-title.md"),
    ];
    const items = buildPaletteItems(makeSources({ tasks }));
    const labels = items.filter((i) => i.kind === "task").map((i) => i.label);
    expect(labels).toEqual(["Custom title", "no-title"]);
  });

  it("includes notes when vault path is set, with relative path as hint", () => {
    const notes = [note("/vault/journal/april.md")];
    const items = buildPaletteItems(makeSources({ notes }));
    const n = items.find((i) => i.kind === "note");
    expect(n?.label).toBe("journal/april");
    expect(n?.hint).toBe("journal/april.md");
  });

  it("skips notes when vault path is null", () => {
    const notes = [note("/vault/foo.md")];
    const items = buildPaletteItems(makeSources({ notes, vaultPath: null }));
    expect(items.find((i) => i.kind === "note")).toBeUndefined();
  });

  it("running a board item calls goto with the encoded board route", () => {
    const goto = vi.fn();
    const boards = [{ name: "my board", columns: [] }];
    const items = buildPaletteItems(makeSources({ boards, goto }));
    items.find((i) => i.kind === "board")?.run();
    expect(goto).toHaveBeenCalledWith("/boards/my%20board");
  });

  it("running a task item calls openTask with the absolute path", () => {
    const openTask = vi.fn();
    const tasks = [task("/v/boards/b/c/t.md", "T")];
    const items = buildPaletteItems(makeSources({ tasks, openTask }));
    items.find((i) => i.kind === "task")?.run();
    expect(openTask).toHaveBeenCalledWith("/v/boards/b/c/t.md");
  });

  it("emits theme switch actions when setThemePref is provided", () => {
    const setThemePref = vi.fn();
    const items = buildPaletteItems(makeSources({ setThemePref }));
    const ids = items.map((i) => i.id);
    expect(ids).toEqual(
      expect.arrayContaining(["action:theme-system", "action:theme-light", "action:theme-dark"]),
    );
  });

  it("omits theme actions when setThemePref is not provided", () => {
    const items = buildPaletteItems(makeSources({}));
    expect(items.find((i) => i.id === "action:theme-light")).toBeUndefined();
  });

  it("running a theme action calls setThemePref with the right value", () => {
    const setThemePref = vi.fn();
    const items = buildPaletteItems(makeSources({ setThemePref }));
    items.find((i) => i.id === "action:theme-light")?.run();
    expect(setThemePref).toHaveBeenCalledWith("light");
  });

  it("emits create actions when startCreating is provided", () => {
    const startCreating = vi.fn();
    const items = buildPaletteItems(makeSources({ startCreating }));
    const ids = items.map((i) => i.id);
    expect(ids).toEqual(
      expect.arrayContaining(["action:new-board", "action:new-note", "action:new-folder"]),
    );
  });

  it("running a create action calls startCreating with the right kind", () => {
    const startCreating = vi.fn();
    const items = buildPaletteItems(makeSources({ startCreating }));
    items.find((i) => i.id === "action:new-board")?.run();
    items.find((i) => i.id === "action:new-note")?.run();
    items.find((i) => i.id === "action:new-folder")?.run();
    expect(startCreating).toHaveBeenNthCalledWith(1, "board");
    expect(startCreating).toHaveBeenNthCalledWith(2, "note");
    expect(startCreating).toHaveBeenNthCalledWith(3, "folder");
  });

  it("omits create actions when startCreating is not provided", () => {
    const items = buildPaletteItems(makeSources({}));
    expect(items.find((i) => i.id === "action:new-board")).toBeUndefined();
  });
});

describe("filterPaletteItems", () => {
  function items() {
    return buildPaletteItems(
      makeSources({
        boards: [{ name: "alpha", columns: [] }],
        tasks: [task("/v/boards/alpha/done/Fix-navbar.md", "Fix navbar")],
      }),
    );
  }

  it("returns all items (up to the limit) when the query is empty", () => {
    const all = items();
    expect(filterPaletteItems(all, "")).toEqual(all);
  });

  it("matches case-insensitively across the searchable string", () => {
    const r = filterPaletteItems(items(), "FIX");
    expect(r.some((i) => i.label === "Fix navbar")).toBe(true);
  });

  it("requires every whitespace-separated token to match", () => {
    const r = filterPaletteItems(items(), "fix navbar");
    expect(r.some((i) => i.label === "Fix navbar")).toBe(true);
    const r2 = filterPaletteItems(items(), "fix nonexistent");
    expect(r2).toEqual([]);
  });

  it("respects the limit argument", () => {
    const all = items();
    expect(filterPaletteItems(all, "", 1)).toHaveLength(1);
  });
});
