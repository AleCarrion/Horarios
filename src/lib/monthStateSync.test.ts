import { describe, expect, it } from "vitest";
import { fromMonthRow, sameState, toMonthRow } from "./monthStateSync";

describe("estado del mes ↔ servidor", () => {
  it("no decision is a draft on the server and back", () => {
    expect(toMonthRow(2026, 10, null)).toEqual({ year: 2026, month: 10, status: "draft" });
    expect(fromMonthRow({ status: "draft", changed_at: "x" })).toBeNull();
  });
  it("published and reopened round-trip with the server's timestamp", () => {
    expect(toMonthRow(2026, 10, { state: "published", at: "a" }).status).toBe("published");
    expect(fromMonthRow({ status: "reopened", changed_at: "t" })).toEqual({ state: "reopened", at: "t" });
  });
  it("same decision ignores the timestamp", () => {
    expect(sameState({ state: "published", at: "1" }, { state: "published", at: "2" })).toBe(true);
    expect(sameState(null, { state: "published", at: "2" })).toBe(false);
  });
});
