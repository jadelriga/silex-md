import { describe, it, expect, vi } from "vitest";

vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: vi.fn(),
  requestPermission: vi.fn(),
  sendNotification: vi.fn(),
}));

import { entryReminderTime, remindersDueAtOrBefore, msUntilNextMinute } from "./scheduler";
import type { VaultEntry } from "$lib/api/vault";

function task(overrides: { path: string; reminder?: string; title?: string }): VaultEntry {
  const fm: Record<string, unknown> = {};
  if (overrides.reminder !== undefined) fm.reminder = overrides.reminder;
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

describe("entryReminderTime", () => {
  it("returns null when no reminder is set", () => {
    expect(entryReminderTime(task({ path: "/a.md" }))).toBeNull();
  });

  it("returns null for a non-string reminder", () => {
    const t = task({ path: "/a.md" });
    (t.frontmatter as Record<string, unknown>).reminder = 12345;
    expect(entryReminderTime(t)).toBeNull();
  });

  it("returns null for an unparseable reminder", () => {
    expect(entryReminderTime(task({ path: "/a.md", reminder: "not-a-date" }))).toBeNull();
  });

  it("parses a valid ISO datetime", () => {
    const d = entryReminderTime(task({ path: "/a.md", reminder: "2026-05-10T14:30" }));
    expect(d).not.toBeNull();
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getHours()).toBe(14);
  });
});

describe("msUntilNextMinute", () => {
  const minute = 60_000;

  it("returns the gap to the next minute boundary", () => {
    expect(msUntilNextMinute(10 * minute + 30_000)).toBe(30_000);
    expect(msUntilNextMinute(10 * minute + 59_999)).toBe(1);
  });

  it("returns a full minute when exactly on the boundary", () => {
    expect(msUntilNextMinute(10 * minute)).toBe(minute);
  });
});

describe("remindersDueAtOrBefore", () => {
  const now = new Date("2026-05-10T15:00:00");

  it("returns entries with a reminder time at or before now", () => {
    const entries = [
      task({ path: "/past.md", reminder: "2026-05-10T14:30" }),
      task({ path: "/future.md", reminder: "2026-05-10T16:00" }),
    ];
    const result = remindersDueAtOrBefore(entries, now, new Set());
    expect(result.map((e) => e.path)).toEqual(["/past.md"]);
  });

  it("treats reminder time exactly equal to now as due", () => {
    const entries = [task({ path: "/exact.md", reminder: "2026-05-10T15:00" })];
    expect(remindersDueAtOrBefore(entries, now, new Set())).toHaveLength(1);
  });

  it("excludes entries already in the fired set", () => {
    const entries = [task({ path: "/past.md", reminder: "2026-05-10T14:30" })];
    expect(remindersDueAtOrBefore(entries, now, new Set(["/past.md"]))).toEqual([]);
  });

  it("excludes entries with no reminder", () => {
    expect(
      remindersDueAtOrBefore([task({ path: "/x.md" })], now, new Set()),
    ).toEqual([]);
  });

  it("returns multiple matches in one pass", () => {
    const entries = [
      task({ path: "/a.md", reminder: "2026-05-10T10:00" }),
      task({ path: "/b.md", reminder: "2026-05-10T11:00" }),
      task({ path: "/c.md", reminder: "2026-05-11T10:00" }),
    ];
    expect(remindersDueAtOrBefore(entries, now, new Set()).map((e) => e.path)).toEqual([
      "/a.md",
      "/b.md",
    ]);
  });
});
