import { describe, it, expect } from "vitest";
import { toggleCheckboxAtIndex } from "./checkbox";

describe("toggleCheckboxAtIndex", () => {
  it("toggles unchecked to checked", () => {
    expect(toggleCheckboxAtIndex("- [ ] Task", 0)).toBe("- [x] Task");
  });

  it("toggles checked to unchecked", () => {
    expect(toggleCheckboxAtIndex("- [x] Done", 0)).toBe("- [ ] Done");
  });

  it("treats uppercase X as checked", () => {
    expect(toggleCheckboxAtIndex("- [X] Done", 0)).toBe("- [ ] Done");
  });

  it("toggles only the targeted index in a list", () => {
    const input = ["- [x] One", "- [ ] Two", "- [x] Three"].join("\n");
    const out = toggleCheckboxAtIndex(input, 1);
    expect(out).toBe(["- [x] One", "- [x] Two", "- [x] Three"].join("\n"));
  });

  it("handles indented checkboxes", () => {
    const input = "  - [ ] Nested";
    expect(toggleCheckboxAtIndex(input, 0)).toBe("  - [x] Nested");
  });

  it("handles asterisk bullets", () => {
    expect(toggleCheckboxAtIndex("* [ ] Star", 0)).toBe("* [x] Star");
  });

  it("ignores non-checkbox lines when counting", () => {
    const input = ["text", "- [ ] One", "more text", "- [ ] Two"].join("\n");
    expect(toggleCheckboxAtIndex(input, 1)).toBe(
      ["text", "- [ ] One", "more text", "- [x] Two"].join("\n"),
    );
  });

  it("returns the body unchanged when the index is out of range", () => {
    const input = "- [ ] Only";
    expect(toggleCheckboxAtIndex(input, 5)).toBe(input);
  });

  it("preserves trailing content after the bracket", () => {
    expect(toggleCheckboxAtIndex("- [ ] Task with `code` and **bold**", 0)).toBe(
      "- [x] Task with `code` and **bold**",
    );
  });
});
