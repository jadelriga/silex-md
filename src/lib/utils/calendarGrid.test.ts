import { describe, it, expect } from "vitest";
import { monthGrid, addMonths, monthOf } from "./calendarGrid";

describe("monthGrid", () => {
  it("starts June 2026 on Monday the 1st (Monday-start month)", () => {
    const grid = monthGrid(2026, 6);
    expect(grid).toHaveLength(42);
    expect(grid[0]).toEqual({ iso: "2026-06-01", day: 1, inMonth: true });
    expect(grid[29]).toEqual({ iso: "2026-06-30", day: 30, inMonth: true });
    // Trailing cells roll into July, marked out-of-month
    expect(grid[30]).toEqual({ iso: "2026-07-01", day: 1, inMonth: false });
    expect(grid[41].iso).toBe("2026-07-12");
  });

  it("pads leading days from the previous month", () => {
    // May 2026 starts on a Friday → 4 leading April cells
    const grid = monthGrid(2026, 5);
    expect(grid[0]).toEqual({ iso: "2026-04-27", day: 27, inMonth: false });
    expect(grid[4]).toEqual({ iso: "2026-05-01", day: 1, inMonth: true });
  });

  it("handles January (year boundary in leading cells)", () => {
    // Jan 1 2026 is a Thursday → leading cells from Dec 2025
    const grid = monthGrid(2026, 1);
    expect(grid[0]).toEqual({ iso: "2025-12-29", day: 29, inMonth: false });
    expect(grid[3]).toEqual({ iso: "2026-01-01", day: 1, inMonth: true });
  });
});

describe("addMonths", () => {
  it("moves within a year", () => {
    expect(addMonths(2026, 6, 1)).toEqual({ year: 2026, month: 7 });
    expect(addMonths(2026, 6, -1)).toEqual({ year: 2026, month: 5 });
  });

  it("crosses year boundaries", () => {
    expect(addMonths(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(addMonths(2026, 1, -13)).toEqual({ year: 2024, month: 12 });
  });
});

describe("monthOf", () => {
  it("extracts year and month from an ISO date", () => {
    expect(monthOf("2026-06-10")).toEqual({ year: 2026, month: 6 });
    expect(monthOf("2025-01-01")).toEqual({ year: 2025, month: 1 });
  });
});
