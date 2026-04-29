import { describe, it, expect, vi } from "vitest";

vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: vi.fn(),
  requestPermission: vi.fn(),
  sendNotification: vi.fn(),
}));

import { todayIso, dueTodayUnnotified } from "./scheduler";
import type { VaultEntry } from "$lib/api/vault";

function task(overrides: { path: string; due?: string; title?: string }): VaultEntry {
  const fm: Record<string, unknown> = {};
  if (overrides.due !== undefined) fm.due = overrides.due;
  if (overrides.title !== undefined) fm.title = overrides.title;
  return {
    path: overrides.path,
    kind: "task",
    board: "b",
    column: "c",
    frontmatter: fm,
    subtaskTotal: 0,
    subtaskDone: 0,
  };
}

describe("todayIso", () => {
  it("formats as YYYY-MM-DD", () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(todayIso(new Date(2026, 11, 31))).toBe("2026-12-31");
  });
});

describe("dueTodayUnnotified", () => {
  const today = "2026-04-29";

  it("returns tasks whose due equals today", () => {
    const t = task({ path: "/a.md", due: today });
    expect(dueTodayUnnotified([t], today, new Set())).toEqual([t]);
  });

  it("excludes tasks whose due is not today", () => {
    const t = task({ path: "/a.md", due: "2026-04-30" });
    expect(dueTodayUnnotified([t], today, new Set())).toEqual([]);
  });

  it("excludes tasks already in the notified set", () => {
    const t = task({ path: "/a.md", due: today });
    expect(dueTodayUnnotified([t], today, new Set(["/a.md"]))).toEqual([]);
  });

  it("excludes tasks with no due date", () => {
    const t = task({ path: "/a.md" });
    expect(dueTodayUnnotified([t], today, new Set())).toEqual([]);
  });

  it("excludes tasks whose due is not a string", () => {
    const t: VaultEntry = task({ path: "/a.md" });
    (t.frontmatter as Record<string, unknown>).due = 12345;
    expect(dueTodayUnnotified([t], today, new Set())).toEqual([]);
  });

  it("returns multiple tasks all due today", () => {
    const a = task({ path: "/a.md", due: today });
    const b = task({ path: "/b.md", due: today });
    expect(dueTodayUnnotified([a, b], today, new Set())).toHaveLength(2);
  });

  it("returns only the unnotified subset when some are notified", () => {
    const a = task({ path: "/a.md", due: today });
    const b = task({ path: "/b.md", due: today });
    const result = dueTodayUnnotified([a, b], today, new Set(["/a.md"]));
    expect(result).toEqual([b]);
  });
});
