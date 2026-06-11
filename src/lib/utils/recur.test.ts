import { describe, it, expect } from "vitest";
import { parseRepeat, repeatLabel, nextOccurrence } from "./recur";

const at = (iso: string) => new Date(iso);

describe("parseRepeat", () => {
  it("accepts the known values", () => {
    expect(parseRepeat("daily")).toBe("daily");
    expect(parseRepeat("weekly")).toBe("weekly");
    expect(parseRepeat("biweekly")).toBe("biweekly");
    expect(parseRepeat("monthly")).toBe("monthly");
    expect(parseRepeat("yearly")).toBe("yearly");
  });

  it("treats junk as no-repeat", () => {
    expect(parseRepeat("fortnightlyish")).toBeNull();
    expect(parseRepeat("")).toBeNull();
    expect(parseRepeat(7)).toBeNull();
    expect(parseRepeat(undefined)).toBeNull();
    expect(parseRepeat(null)).toBeNull();
  });
});

describe("repeatLabel", () => {
  it("labels every repeat", () => {
    expect(repeatLabel("biweekly")).toBe("every 2 weeks");
    expect(repeatLabel("daily")).toBe("daily");
  });
});

describe("nextOccurrence", () => {
  it("returns null for an unparseable anchor", () => {
    expect(nextOccurrence("daily", "not a date", at("2026-06-10T09:00"))).toBeNull();
  });

  it("returns the anchor itself when it is still in the future", () => {
    expect(nextOccurrence("daily", "2026-06-12T09:40", at("2026-06-10T00:00"))).toBe(
      "2026-06-12T09:40",
    );
  });

  it("is strictly after: an occurrence exactly at `after` yields the next one", () => {
    expect(nextOccurrence("daily", "2026-06-10T09:40", at("2026-06-10T09:40"))).toBe(
      "2026-06-11T09:40",
    );
  });

  it("steps weekly and biweekly from the anchor", () => {
    expect(nextOccurrence("weekly", "2026-06-10T09:40", at("2026-06-10T10:00"))).toBe(
      "2026-06-17T09:40",
    );
    expect(nextOccurrence("biweekly", "2026-06-10T09:40", at("2026-06-25T00:00"))).toBe(
      "2026-07-08T09:40",
    );
  });

  it("catches up over many missed periods in one step", () => {
    // Anchor far in the past; next daily occurrence is tomorrow relative
    // to `after`, not a burst of misses.
    expect(nextOccurrence("daily", "2026-01-01T08:00", at("2026-06-10T09:00"))).toBe(
      "2026-06-11T08:00",
    );
    expect(nextOccurrence("weekly", "2026-01-07T08:00", at("2026-06-10T09:00"))).toBe(
      "2026-06-17T08:00",
    );
  });

  it("keeps biweekly phase from the anchor across catch-up", () => {
    // Anchor Jan 2; series is Jan 2, 16, 30, Feb 13, 27, Mar 13, 27...
    expect(nextOccurrence("biweekly", "2026-01-02T09:00", at("2026-03-20T00:00"))).toBe(
      "2026-03-27T09:00",
    );
  });

  it("monthly on the 31st clamps short months but recovers", () => {
    const anchor = "2026-01-31T09:00";
    expect(nextOccurrence("monthly", anchor, at("2026-01-31T09:00"))).toBe(
      "2026-02-28T09:00",
    );
    expect(nextOccurrence("monthly", anchor, at("2026-02-28T09:00"))).toBe(
      "2026-03-31T09:00",
    );
    expect(nextOccurrence("monthly", anchor, at("2026-03-31T09:00"))).toBe(
      "2026-04-30T09:00",
    );
  });

  it("monthly crosses year boundaries", () => {
    expect(nextOccurrence("monthly", "2026-12-15T07:30", at("2026-12-20T00:00"))).toBe(
      "2027-01-15T07:30",
    );
  });

  it("yearly on Feb 29 clamps to Feb 28 in non-leap years and recovers", () => {
    const anchor = "2024-02-29T10:00";
    expect(nextOccurrence("yearly", anchor, at("2024-03-01T00:00"))).toBe(
      "2025-02-28T10:00",
    );
    expect(nextOccurrence("yearly", anchor, at("2027-03-01T00:00"))).toBe(
      "2028-02-29T10:00",
    );
  });

  it("defaults a date-only anchor to 09:00", () => {
    expect(nextOccurrence("daily", "2026-06-10", at("2026-06-10T10:00"))).toBe(
      "2026-06-11T09:00",
    );
  });
});
