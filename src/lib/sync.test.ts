import { describe, expect, it } from "vitest";
import { coalesce, diffSchedules, rowsToSchedule, scheduleToRows } from "./sync";
import { applyEdit, applyRemote, createHistory, undo } from "./domain/history";

describe("sync helpers", () => {
  it("rowsToSchedule groups rows by staff", () => {
    expect(rowsToSchedule([
      { staff_id: "a", day: "2026-10-01", shift_code: "M" },
      { staff_id: "b", day: "2026-10-01", shift_code: "D" },
    ])).toEqual({ a: { "2026-10-01": "M" }, b: { "2026-10-01": "D" } });
  });

  it("scheduleToRows is the inverse", () => {
    const s = { a: { "2026-10-01": "M" as const, "2026-10-02": "T" as const } };
    expect(rowsToSchedule(scheduleToRows(s))).toEqual(s);
  });

  it("diffSchedules returns only changed or new cells", () => {
    const base = { a: { "2026-10-01": "M" as const, "2026-10-02": "T" as const } };
    const next = { a: { "2026-10-01": "M" as const, "2026-10-02": "N" as const, "2026-10-03": "D" as const } };
    expect(diffSchedules(base, next)).toEqual([
      { staff_id: "a", day: "2026-10-02", shift_code: "N" },
      { staff_id: "a", day: "2026-10-03", shift_code: "D" },
    ]);
  });

  it("coalesce keeps the last write per cell", () => {
    const q = coalesce([
      { staff_id: "a", day: "2026-10-01", shift_code: "M" },
      { staff_id: "a", day: "2026-10-01", shift_code: "T" },
      { staff_id: "b", day: "2026-10-01", shift_code: "N" },
    ]);
    expect(q).toEqual([
      { staff_id: "a", day: "2026-10-01", shift_code: "T" },
      { staff_id: "b", day: "2026-10-01", shift_code: "N" },
    ]);
  });
});

describe("applyRemote", () => {
  it("updates present without touching undo history", () => {
    let h = createHistory({ a: { "2026-10-01": "M" as const } });
    h = applyEdit(h, "a", "2026-10-01", "T");
    h = applyRemote(h, "a", "2026-10-02", "N");
    expect(h.present.a["2026-10-02"]).toBe("N");
    expect(h.past).toHaveLength(1);
    h = undo(h);
    expect(h.present.a["2026-10-01"]).toBe("M");
    expect(h.present.a["2026-10-02"]).toBe("N");
  });
});

import { isMissingFunction, withoutAt } from "./sync";

describe("guardado sin pisar cambios", () => {
  it("coalesce keeps the timestamp of the last edit of a cell", () => {
    const rows = coalesce([
      { staff_id: "a", day: "2026-10-01", shift_code: "M", at: "1" },
      { staff_id: "a", day: "2026-10-01", shift_code: "T", at: "2" },
    ]);
    expect(rows).toEqual([{ staff_id: "a", day: "2026-10-01", shift_code: "T", at: "2" }]);
  });
  it("detects a server that lacks the function (old migrations) and strips the client timestamp", () => {
    expect(isMissingFunction({ code: "PGRST202" })).toBe(true);
    expect(isMissingFunction({ message: "Could not find the function public.apply_cells" })).toBe(true);
    expect(isMissingFunction({ code: "42501", message: "permission denied" })).toBe(false);
    expect(isMissingFunction(null)).toBe(false);
    expect(withoutAt([{ staff_id: "a", day: "d", shift_code: "M", at: "x" }])).toEqual([{ staff_id: "a", day: "d", shift_code: "M" }]);
  });
});
