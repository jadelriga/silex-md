import { describe, it, expect } from "vitest";
import { resolveImageSrc, dirnameOf } from "./imagePath";

const noteDir = "/vault/notes";
const vaultRoot = "/vault";

describe("resolveImageSrc", () => {
  it("passes http/https/data URLs through untouched", () => {
    expect(resolveImageSrc("http://x.test/y.png", noteDir, vaultRoot)).toEqual({
      kind: "remote",
      src: "http://x.test/y.png",
    });
    expect(resolveImageSrc("HTTPS://x.test/y.png", noteDir, vaultRoot)).toEqual({
      kind: "remote",
      src: "HTTPS://x.test/y.png",
    });
    expect(resolveImageSrc("data:image/png;base64,iVBOR=", noteDir, vaultRoot)).toEqual({
      kind: "remote",
      src: "data:image/png;base64,iVBOR=",
    });
  });

  it("resolves relative paths against the note directory", () => {
    expect(resolveImageSrc("pics/a.png", noteDir, vaultRoot)).toEqual({
      kind: "local",
      fsPath: "/vault/notes/pics/a.png",
    });
  });

  it("resolves leading-slash paths against the vault root", () => {
    expect(resolveImageSrc("/attachments/x.png", noteDir, vaultRoot)).toEqual({
      kind: "local",
      fsPath: "/vault/attachments/x.png",
    });
  });

  it("percent-decodes the path portion", () => {
    expect(resolveImageSrc("my%20img.png", noteDir, vaultRoot)).toEqual({
      kind: "local",
      fsPath: "/vault/notes/my img.png",
    });
  });

  it("normalizes ./ and ../ segments", () => {
    expect(resolveImageSrc("./a.png", noteDir, vaultRoot)).toEqual({
      kind: "local",
      fsPath: "/vault/notes/a.png",
    });
    expect(resolveImageSrc("../shared/a.png", "/vault/notes/sub", vaultRoot)).toEqual({
      kind: "local",
      fsPath: "/vault/notes/shared/a.png",
    });
  });

  it("strips #fragment and ?query suffixes", () => {
    expect(resolveImageSrc("img.png#small", noteDir, vaultRoot)).toEqual({
      kind: "local",
      fsPath: "/vault/notes/img.png",
    });
    expect(resolveImageSrc("img.png?v=2", noteDir, vaultRoot)).toEqual({
      kind: "local",
      fsPath: "/vault/notes/img.png",
    });
  });

  it("treats file:// URLs as absolute local paths", () => {
    expect(resolveImageSrc("file:///abs/a.png", noteDir, vaultRoot)).toEqual({
      kind: "local",
      fsPath: "/abs/a.png",
    });
    expect(resolveImageSrc("file:///abs/my%20img.png", noteDir, vaultRoot)).toEqual({
      kind: "local",
      fsPath: "/abs/my img.png",
    });
  });

  it("handles Windows backslash-separated bases", () => {
    expect(resolveImageSrc("pics/a.png", "C:\\vault\\notes", "C:\\vault")).toEqual({
      kind: "local",
      fsPath: "C:\\vault\\notes\\pics\\a.png",
    });
    expect(resolveImageSrc("/attachments/x.png", "C:\\vault\\notes", "C:\\vault")).toEqual({
      kind: "local",
      fsPath: "C:\\vault\\attachments\\x.png",
    });
  });

  it("does not throw on malformed percent-encoding", () => {
    expect(resolveImageSrc("bad%Eq.png", noteDir, vaultRoot)).toEqual({
      kind: "local",
      fsPath: "/vault/notes/bad%Eq.png",
    });
  });

  it("resolves paths escaping the vault literally (asset scope is the boundary)", () => {
    // The vault-only asset-protocol scope makes these 404 in the webview; the
    // resolver itself just does the literal path math.
    expect(resolveImageSrc("../../outside.png", noteDir, vaultRoot)).toEqual({
      kind: "local",
      fsPath: "/outside.png",
    });
  });
});

describe("dirnameOf", () => {
  it("returns the containing directory", () => {
    expect(dirnameOf("/vault/notes/a.md")).toBe("/vault/notes");
    expect(dirnameOf("C:\\vault\\notes\\a.md")).toBe("C:\\vault\\notes");
  });

  it("returns the posix root for top-level files", () => {
    expect(dirnameOf("/a.md")).toBe("/");
  });

  it("returns empty string when there is no parent", () => {
    expect(dirnameOf("a.md")).toBe("");
    expect(dirnameOf("")).toBe("");
  });
});
