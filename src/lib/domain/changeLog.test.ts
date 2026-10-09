import { describe, expect, it } from "vitest";
import { appendEntry, canRestore, diffCells, entrySummary, type LogEntry } from "./changeLog";

describe("registro de cambios", () => {
  const a = { x: { "2026-10-01": "M", "2026-10-02": "T" }, y: { "2026-10-01": "D" } } as const;
  const b = { x: { "2026-10-01": "M", "2026-10-02": "D" }, y: { "2026-10-01": "N" } } as const;

  it("lists only the cells that changed", () => {
    expect(diffCells(a as never, b as never)).toEqual([
      { staffId: "x", date: "2026-10-02", from: "T", to: "D" },
      { staffId: "y", date: "2026-10-01", from: "D", to: "N" },
    ]);
    expect(diffCells(a as never, a as never)).toEqual([]);
  });

  it("keeps the newest first, drops the oldest, and ignores empty entries", () => {
    const e = (n: number): LogEntry => ({ at: String(n), label: "x", cells: [{ staffId: "x", date: "d", from: "M", to: "T" }] });
    let log: LogEntry[] = [];
    for (let i = 0; i < 5; i++) log = appendEntry(log, e(i), 3);
    expect(log.map((x) => x.at)).toEqual(["4", "3", "2"]);
    expect(appendEntry(log, { at: "9", label: "x", cells: [] })).toBe(log);
  });

  it("a cell can be restored only while it still holds what the entry set", () => {
    const cell = { staffId: "x", date: "2026-10-02", from: "T" as const, to: "D" as const };
    expect(canRestore(cell, b as never)).toBe(true);
    expect(canRestore(cell, a as never)).toBe(false);
    expect(canRestore({ ...cell, from: undefined }, b as never)).toBe(false);
  });

  it("summarises an entry", () => {
    expect(entrySummary({ at: "", label: "", cells: diffCells(a as never, b as never) })).toBe("2 casillas · 2 personas");
  });
});
