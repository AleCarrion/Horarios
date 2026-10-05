import { describe, expect, it } from "vitest";
import { applyEdit, createHistory, redo, undo } from "./history";

const s0 = { a: { "2026-10-01": "M" as const } };

describe("history", () => {
  it("applies an edit immutably and records the change", () => {
    const h = applyEdit(createHistory(s0), "a", "2026-10-01", "T");
    expect(h.present.a["2026-10-01"]).toBe("T");
    expect(s0.a["2026-10-01"]).toBe("M");
    expect(h.changes).toEqual([{ staffId: "a", date: "2026-10-01", from: "M", to: "T" }]);
  });

  it("ignores no-op edits", () => {
    const h = applyEdit(createHistory(s0), "a", "2026-10-01", "M");
    expect(h.past).toHaveLength(0);
  });

  it("undo and redo", () => {
    let h = applyEdit(createHistory(s0), "a", "2026-10-01", "T");
    h = undo(h);
    expect(h.present.a["2026-10-01"]).toBe("M");
    h = redo(h);
    expect(h.present.a["2026-10-01"]).toBe("T");
  });

  it("a new edit clears redo stack", () => {
    let h = applyEdit(createHistory(s0), "a", "2026-10-01", "T");
    h = undo(h);
    h = applyEdit(h, "a", "2026-10-01", "N");
    expect(h.future).toHaveLength(0);
  });
});
