import { describe, it, expect } from "vitest";
import { compareOrder, sortCards, getOrder } from "./order";
import type { VaultEntry } from "$lib/api/vault";

function entry(path: string, order: string | null): VaultEntry {
  return {
    path,
    kind: "task",
    board: "b",
    column: "c",
    frontmatter: order == null ? {} : { order },
    subtaskTotal: 0,
    subtaskDone: 0,
  };
}

describe("compareOrder", () => {
  it("returns 0 when both are nullish", () => {
    expect(compareOrder(null, null)).toBe(0);
    expect(compareOrder(undefined, undefined)).toBe(0);
  });

  it("puts nullish after defined", () => {
    expect(compareOrder(null, "a0")).toBe(1);
    expect(compareOrder("a0", null)).toBe(-1);
  });

  it("compares strings lexicographically", () => {
    expect(compareOrder("a0", "a1")).toBe(-1);
    expect(compareOrder("a1", "a0")).toBe(1);
    expect(compareOrder("a0", "a0")).toBe(0);
  });
});

describe("sortCards", () => {
  it("orders by frontmatter.order then by path", () => {
    const cards = [entry("/c.md", "a2"), entry("/a.md", "a0"), entry("/b.md", "a1")];
    expect(sortCards(cards).map((c) => c.path)).toEqual(["/a.md", "/b.md", "/c.md"]);
  });

  it("places cards without order after ordered ones, sorted by path", () => {
    const cards = [entry("/a.md", null), entry("/b.md", "a0"), entry("/c.md", null)];
    expect(sortCards(cards).map((c) => c.path)).toEqual(["/b.md", "/a.md", "/c.md"]);
  });
});

describe("getOrder", () => {
  it("returns the order string when present", () => {
    expect(getOrder(entry("/x.md", "a0"))).toBe("a0");
  });

  it("returns null when no order is set", () => {
    expect(getOrder(entry("/x.md", null))).toBeNull();
  });
});
