import { describe, expect, it } from "vitest";
import { isMonthClosed, monthLabel } from "./monthStatus";

describe("estado del mes", () => {
  it("a current or future month is a draft and open", () => {
    expect(isMonthClosed(null, 2026, 10, "2026-10-08")).toBe(false);
    expect(isMonthClosed(null, 2026, 12, "2026-10-08")).toBe(false);
    expect(monthLabel(null, 2026, 10, "2026-10-08")).toBe("draft");
  });
  it("a month that is over closes by itself, until someone reopens it", () => {
    expect(isMonthClosed(null, 2026, 9, "2026-10-01")).toBe(true);
    expect(monthLabel(null, 2026, 9, "2026-10-01")).toBe("past");
    expect(isMonthClosed({ state: "reopened", at: "x" }, 2026, 9, "2026-10-01")).toBe(false);
    expect(monthLabel({ state: "reopened", at: "x" }, 2026, 9, "2026-10-01")).toBe("reopened");
  });
  it("the last day of the month still counts as the month being on", () => {
    expect(isMonthClosed(null, 2026, 9, "2026-09-30")).toBe(false);
  });
  it("a published month is closed whenever it is", () => {
    expect(isMonthClosed({ state: "published", at: "x" }, 2026, 12, "2026-10-08")).toBe(true);
  });
  it("without knowing today nothing closes by itself", () => {
    expect(isMonthClosed(null, 2020, 1, null)).toBe(false);
  });
});
