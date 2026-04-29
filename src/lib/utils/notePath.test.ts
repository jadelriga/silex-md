import { describe, it, expect } from "vitest";
import {
  noteRelativePath,
  noteHref,
  decodeNoteRouteParam,
  buildNoteTree,
} from "./notePath";
import type { VaultEntry } from "$lib/api/vault";

function makeNote(path: string): VaultEntry {
  return {
    path,
    kind: "note",
    board: null,
    column: null,
    frontmatter: null,
    subtaskTotal: 0,
    subtaskDone: 0,
  };
}

describe("noteRelativePath", () => {
  it("strips the vault prefix", () => {
    expect(noteRelativePath("/vault/foo/bar.md", "/vault")).toBe("foo/bar.md");
  });

  it("handles a vault path with a trailing slash", () => {
    expect(noteRelativePath("/vault/foo.md", "/vault/")).toBe("foo.md");
  });

  it("returns the path unchanged when the prefix doesn't match", () => {
    expect(noteRelativePath("/elsewhere/foo.md", "/vault")).toBe(
      "/elsewhere/foo.md",
    );
  });
});

describe("noteHref / decodeNoteRouteParam", () => {
  it("encodes path segments while preserving slashes", () => {
    expect(noteHref("foo bar/baz.md")).toBe("/notes/foo%20bar/baz.md");
  });

  it("round-trips through decode", () => {
    const rel = "with spaces/and # hash.md";
    const href = noteHref(rel);
    const param = href.replace(/^\/notes\//, "");
    expect(decodeNoteRouteParam(param)).toBe(rel);
  });
});

describe("buildNoteTree", () => {
  it("places a single root-level note as a file", () => {
    const tree = buildNoteTree([makeNote("/vault/daily.md")], "/vault");
    expect(tree).toEqual([
      {
        type: "file",
        name: "daily",
        relativePath: "daily.md",
        absolutePath: "/vault/daily.md",
      },
    ]);
  });

  it("nests files inside folders by path", () => {
    const tree = buildNoteTree(
      [makeNote("/vault/journal/2026/april.md")],
      "/vault",
    );
    expect(tree).toEqual([
      {
        type: "folder",
        name: "journal",
        relativePath: "journal",
        children: [
          {
            type: "folder",
            name: "2026",
            relativePath: "journal/2026",
            children: [
              {
                type: "file",
                name: "april",
                relativePath: "journal/2026/april.md",
                absolutePath: "/vault/journal/2026/april.md",
              },
            ],
          },
        ],
      },
    ]);
  });

  it("places folders before files and sorts alphabetically at each level", () => {
    const tree = buildNoteTree(
      [
        makeNote("/vault/zeta.md"),
        makeNote("/vault/alpha/inner.md"),
        makeNote("/vault/beta.md"),
      ],
      "/vault",
    );
    expect(tree.map((n) => `${n.type}:${n.name}`)).toEqual([
      "folder:alpha",
      "file:beta",
      "file:zeta",
    ]);
  });

  it("strips the .md extension from display names but keeps it in paths", () => {
    const tree = buildNoteTree([makeNote("/vault/note.md")], "/vault");
    expect(tree[0].type).toBe("file");
    if (tree[0].type === "file") {
      expect(tree[0].name).toBe("note");
      expect(tree[0].relativePath).toBe("note.md");
    }
  });
});
