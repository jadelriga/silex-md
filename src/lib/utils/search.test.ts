import { describe, it, expect } from "vitest";
import {
  buildSnippet,
  frontmatterText,
  hasActiveFilters,
  highlightMatches,
  matchesFilters,
  queryTokens,
  searchEntries,
} from "./search";
import type { VaultEntry } from "$lib/api/vault";

function task(path: string, title: string, fmExtra: Record<string, unknown> = {}): VaultEntry {
  return {
    path,
    kind: "task",
    board: "b",
    column: "c",
    frontmatter: { title, ...fmExtra },
    subtaskTotal: 0,
    subtaskDone: 0,
  };
}

describe("frontmatterText", () => {
  it("flattens string and string-array values", () => {
    const text = frontmatterText({
      title: "Hello",
      priority: "high",
      tags: ["frontend", "bug"],
      due: "2026-05-10",
      created: 12345,
    });
    expect(text).toContain("Hello");
    expect(text).toContain("high");
    expect(text).toContain("frontend");
    expect(text).toContain("bug");
    expect(text).not.toContain("12345");
  });

  it("handles null", () => {
    expect(frontmatterText(null)).toBe("");
  });
});

describe("buildSnippet", () => {
  it("returns the start of the body when the query is missing", () => {
    expect(buildSnippet("Hello world", "")).toBe("Hello world");
  });

  it("centers the snippet around the matched query", () => {
    const body = "x".repeat(200) + " needle " + "y".repeat(200);
    const s = buildSnippet(body, "needle");
    expect(s.includes("needle")).toBe(true);
    expect(s.startsWith("…")).toBe(true);
    expect(s.endsWith("…")).toBe(true);
  });

  it("collapses whitespace", () => {
    expect(buildSnippet("a   b\n\nc", "")).toBe("a b c");
  });
});

describe("searchEntries", () => {
  const entries: VaultEntry[] = [
    task("/v/boards/b/c/navbar.md", "Fix navbar bug", { tags: ["frontend"] }),
    task("/v/boards/b/c/auth.md", "Refactor auth"),
  ];

  it("returns empty when query is empty", () => {
    expect(searchEntries(entries, new Map(), "")).toEqual([]);
  });

  it("matches title", () => {
    const hits = searchEntries(entries, new Map(), "navbar");
    expect(hits).toHaveLength(1);
    expect(hits[0].title).toBe("Fix navbar bug");
  });

  it("matches case-insensitively", () => {
    const hits = searchEntries(entries, new Map(), "AUTH");
    expect(hits).toHaveLength(1);
  });

  it("requires every token to match", () => {
    const hits = searchEntries(entries, new Map(), "fix nonexistent");
    expect(hits).toEqual([]);
  });

  it("searches frontmatter values", () => {
    const hits = searchEntries(entries, new Map(), "frontend");
    expect(hits).toHaveLength(1);
    expect(hits[0].title).toBe("Fix navbar bug");
  });

  it("searches body content via the bodies map", () => {
    const bodies = new Map([
      ["/v/boards/b/c/navbar.md", "The actual fix is in the responsive layout module."],
      ["/v/boards/b/c/auth.md", "Token rotation needs more work."],
    ]);
    const hits = searchEntries(entries, bodies, "responsive");
    expect(hits).toHaveLength(1);
    expect(hits[0].snippet).toContain("responsive");
  });

  it("respects the limit argument", () => {
    const many = Array.from({ length: 100 }, (_, i) => task(`/v/x${i}.md`, `same word ${i}`));
    expect(searchEntries(many, new Map(), "same", {}, 10)).toHaveLength(10);
  });
});

describe("queryTokens", () => {
  it("splits on whitespace and lowercases", () => {
    expect(queryTokens("  Foo  Bar  ")).toEqual(["foo", "bar"]);
  });
  it("returns [] for empty/whitespace", () => {
    expect(queryTokens("")).toEqual([]);
    expect(queryTokens("   ")).toEqual([]);
  });
});

describe("highlightMatches", () => {
  it("returns escaped text untouched when no tokens", () => {
    expect(highlightMatches("Hello <world>", [])).toBe("Hello &lt;world&gt;");
  });
  it("wraps each occurrence of a single token", () => {
    expect(highlightMatches("foo bar foo", ["foo"])).toBe(
      `<mark class="search-hit">foo</mark> bar <mark class="search-hit">foo</mark>`,
    );
  });
  it("matches case-insensitively but preserves original casing in the mark", () => {
    expect(highlightMatches("Foo and FOO", ["foo"])).toBe(
      `<mark class="search-hit">Foo</mark> and <mark class="search-hit">FOO</mark>`,
    );
  });
  it("wraps any of multiple tokens", () => {
    expect(highlightMatches("alpha beta gamma", ["alpha", "gamma"])).toBe(
      `<mark class="search-hit">alpha</mark> beta <mark class="search-hit">gamma</mark>`,
    );
  });
  it("prefers the longer token when two overlap (e.g. foo vs foobar)", () => {
    expect(highlightMatches("foobar", ["foo", "foobar"])).toBe(
      `<mark class="search-hit">foobar</mark>`,
    );
  });
  it("escapes regex special characters in tokens", () => {
    expect(highlightMatches("a.b a+b", ["a.b"])).toBe(
      `<mark class="search-hit">a.b</mark> a+b`,
    );
  });
  it("escapes HTML in surrounding text and matched substring", () => {
    expect(highlightMatches("<script>foo", ["foo"])).toBe(
      `&lt;script&gt;<mark class="search-hit">foo</mark>`,
    );
  });
  it("ignores empty tokens", () => {
    expect(highlightMatches("foo bar", ["", " ", "foo"])).toBe(
      `<mark class="search-hit">foo</mark> bar`,
    );
  });
});

describe("hasActiveFilters", () => {
  it("returns false for undefined / empty / no-array filters", () => {
    expect(hasActiveFilters(undefined)).toBe(false);
    expect(hasActiveFilters({})).toBe(false);
    expect(hasActiveFilters({ priorities: [], tags: [] })).toBe(false);
  });
  it("returns true when any filter is set", () => {
    expect(hasActiveFilters({ board: "x" })).toBe(true);
    expect(hasActiveFilters({ kind: "task" })).toBe(true);
    expect(hasActiveFilters({ priorities: ["high"] })).toBe(true);
    expect(hasActiveFilters({ tags: ["urgent"] })).toBe(true);
    expect(hasActiveFilters({ reminderRange: "today" })).toBe(true);
  });
});

describe("matchesFilters", () => {
  const t = task("/v/boards/b/c/foo.md", "Foo", {
    priority: "high",
    tags: ["urgent", "frontend"],
  });
  it("passes when no filter is set", () => {
    expect(matchesFilters(t, {})).toBe(true);
  });
  it("filters by board", () => {
    expect(matchesFilters(t, { board: "b" })).toBe(true);
    expect(matchesFilters(t, { board: "other" })).toBe(false);
  });
  it("filters by kind", () => {
    expect(matchesFilters(t, { kind: "task" })).toBe(true);
    expect(matchesFilters(t, { kind: "note" })).toBe(false);
  });
  it("filters by priority — entry priority must be one of the chosen", () => {
    expect(matchesFilters(t, { priorities: ["high"] })).toBe(true);
    expect(matchesFilters(t, { priorities: ["low", "high"] })).toBe(true);
    expect(matchesFilters(t, { priorities: ["low"] })).toBe(false);
  });
  it("filters by tags — entry must have all the listed tags", () => {
    expect(matchesFilters(t, { tags: ["urgent"] })).toBe(true);
    expect(matchesFilters(t, { tags: ["urgent", "frontend"] })).toBe(true);
    expect(matchesFilters(t, { tags: ["urgent", "missing"] })).toBe(false);
  });
  it("filters by reminderRange=none", () => {
    const without = task("/v/boards/b/c/x.md", "X");
    const withRem = task("/v/boards/b/c/y.md", "Y", { reminder: "2030-01-01T00:00:00Z" });
    expect(matchesFilters(without, { reminderRange: "none" })).toBe(true);
    expect(matchesFilters(withRem, { reminderRange: "none" })).toBe(false);
  });
});

describe("searchEntries with filters", () => {
  const a = task("/v/boards/alpha/done/a.md", "A", { priority: "high", tags: ["x"] });
  const b = task("/v/boards/beta/done/b.md", "B", { priority: "low", tags: ["y"] });
  const c = task("/v/boards/alpha/done/c.md", "C", { priority: "high", tags: ["x", "y"] });
  // Override board on b so the test data is realistic
  b.board = "beta";
  c.board = "alpha";
  a.board = "alpha";

  it("returns all filter-passing entries when query is empty but filters are active", () => {
    const hits = searchEntries([a, b, c], new Map(), "", { board: "alpha" });
    expect(hits.map((h) => h.path)).toEqual([a.path, c.path]);
  });
  it("returns [] when both query and filters are empty", () => {
    expect(searchEntries([a, b, c], new Map(), "", {})).toEqual([]);
  });
  it("intersects filters with query tokens", () => {
    const hits = searchEntries([a, b, c], new Map(), "high", {
      priorities: ["high"],
    });
    // matches both a and c (priority=high) AND haystack contains "high"
    expect(hits.map((h) => h.path).sort()).toEqual([a.path, c.path].sort());
  });
});
