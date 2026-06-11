import { describe, it, expect } from "vitest";
import { activeBoardFromPathname, basename } from "./routes";

describe("activeBoardFromPathname", () => {
  it("returns the decoded board name for board routes", () => {
    expect(activeBoardFromPathname("/boards/silex-backlog")).toBe("silex-backlog");
    expect(activeBoardFromPathname("/boards/my%20board")).toBe("my board");
    expect(activeBoardFromPathname("/boards/b/extra")).toBe("b");
  });

  it("returns null for non-board routes", () => {
    expect(activeBoardFromPathname("/")).toBeNull();
    expect(activeBoardFromPathname("/calendar")).toBeNull();
    expect(activeBoardFromPathname("/notes/foo")).toBeNull();
  });
});

describe("basename", () => {
  it("returns the last path segment", () => {
    expect(basename("/Users/me/vault")).toBe("vault");
    expect(basename("/Users/me/vault/")).toBe("vault");
    expect(basename("vault")).toBe("vault");
  });
});
