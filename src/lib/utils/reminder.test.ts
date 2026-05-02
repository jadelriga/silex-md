import { describe, it, expect } from "vitest";
import { splitReminder, joinReminder, formatReminder, todayIsoDate } from "./reminder";

describe("todayIsoDate", () => {
  it("formats as YYYY-MM-DD", () => {
    expect(todayIsoDate(new Date(2026, 4, 10))).toBe("2026-05-10");
    expect(todayIsoDate(new Date(2026, 0, 1))).toBe("2026-01-01");
  });
});

describe("splitReminder", () => {
  it("returns sensible defaults for null / empty", () => {
    const result = splitReminder(null);
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.time).toBe("09:00");
  });

  it("splits ISO datetime into date and time parts", () => {
    expect(splitReminder("2026-05-10T14:30")).toEqual({
      date: "2026-05-10",
      time: "14:30",
    });
  });

  it("handles ISO with seconds", () => {
    expect(splitReminder("2026-05-10T14:30:45")).toEqual({
      date: "2026-05-10",
      time: "14:30",
    });
  });

  it("falls back to default time when missing", () => {
    expect(splitReminder("2026-05-10")).toEqual({
      date: "2026-05-10",
      time: "09:00",
    });
  });
});

describe("joinReminder", () => {
  it("combines date and time into ISO", () => {
    expect(joinReminder("2026-05-10", "14:30")).toBe("2026-05-10T14:30");
  });

  it("falls back to default time when invalid", () => {
    expect(joinReminder("2026-05-10", "")).toBe("2026-05-10T09:00");
    expect(joinReminder("2026-05-10", "garbage")).toBe("2026-05-10T09:00");
  });
});

describe("formatReminder", () => {
  it("returns empty string for null / empty", () => {
    expect(formatReminder(null)).toBe("");
    expect(formatReminder("")).toBe("");
  });

  it("formats valid ISO into a short human label", () => {
    const result = formatReminder("2026-05-10T14:30");
    expect(result).toContain("14:30");
    expect(result.toLowerCase()).toMatch(/may/i);
  });

  it("returns the raw value when not parseable", () => {
    expect(formatReminder("not a date")).toBe("not a date");
  });
});
