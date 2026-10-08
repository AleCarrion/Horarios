import { describe, expect, it } from "vitest";
import { monthDates, weeksOf } from "./dates";

describe("weeksOf", () => {
  it("splits October 2026 (starts on a Thursday) into Monday-based weeks", () => {
    const weeks = weeksOf(monthDates(2026, 10));
    expect(weeks.map((w) => w.length)).toEqual([4, 7, 7, 7, 6]);
    expect(weeks[0][0]).toBe("2026-10-01");
    expect(weeks[1][0]).toBe("2026-10-05");
    expect(weeks.flat()).toEqual(monthDates(2026, 10));
  });

  it("a month that starts on a Monday has full weeks", () => {
    const weeks = weeksOf(monthDates(2026, 6)); // 1 June 2026 is a Monday
    expect(weeks[0]).toHaveLength(7);
    expect(weeks.flat()).toHaveLength(30);
  });
});
