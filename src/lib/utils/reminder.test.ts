import { describe, it, expect } from "vitest";
import {
  splitReminder,
  joinReminder,
  formatReminder,
  formatReminderDate,
  reminderStatus,
  todayIsoDate,
} from "./reminder";

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

describe("formatReminderDate", () => {
  const now = new Date(2026, 5, 10); // 2026-06-10

  it("returns empty string for null / empty", () => {
    expect(formatReminderDate(null, now)).toBe("");
    expect(formatReminderDate("", now)).toBe("");
  });

  it("formats a same-year date without the year", () => {
    const result = formatReminderDate("2026-06-12T09:00", now);
    expect(result).toMatch(/jun/i);
    expect(result).toContain("12");
    expect(result).not.toContain("2026");
  });

  it("includes the year when it differs from now", () => {
    expect(formatReminderDate("2027-01-05T09:00", now)).toContain("2027");
  });

  it("returns the raw value when not parseable", () => {
    expect(formatReminderDate("not a date", now)).toBe("not a date");
  });
});

describe("reminderStatus", () => {
  const now = new Date(2026, 5, 10, 12, 0); // 2026-06-10 12:00

  it("returns null for null / empty / unparseable", () => {
    expect(reminderStatus(null, now)).toBeNull();
    expect(reminderStatus("", now)).toBeNull();
    expect(reminderStatus("not a date", now)).toBeNull();
  });

  it("classifies past datetimes as overdue", () => {
    expect(reminderStatus("2026-06-09T09:00", now)).toBe("overdue");
    expect(reminderStatus("2026-06-10T11:59", now)).toBe("overdue");
  });

  it("classifies later-today datetimes as today", () => {
    expect(reminderStatus("2026-06-10T18:00", now)).toBe("today");
  });

  it("classifies future days as upcoming", () => {
    expect(reminderStatus("2026-06-11T09:00", now)).toBe("upcoming");
    expect(reminderStatus("2027-01-01T09:00", now)).toBe("upcoming");
  });
});
