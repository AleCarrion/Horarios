import { describe, expect, it } from "vitest";
import { fromStaffRows, toStaffRows } from "./staffSync";
import { DEFAULT_STAFF } from "./domain/roster";

describe("staff <-> supabase rows", () => {
  it("round-trips the whole roster including order, dates and cover settings", () => {
    const staff = DEFAULT_STAFF.map((s) => (s.id === "arturo" ? { ...s, activeFrom: "2026-09-07", activeTo: "2026-12-31" } : s));
    expect(fromStaffRows(toStaffRows(staff))).toEqual(staff);
  });

  it("writes sort_order from the array position and marks rows active", () => {
    const rows = toStaffRows(DEFAULT_STAFF);
    expect(rows.map((r) => r.sort_order)).toEqual(DEFAULT_STAFF.map((_, i) => i));
    expect(rows.every((r) => r.active)).toBe(true);
    expect(rows[1]).toMatchObject({ id: "ana", extra_shifts: ["M"], max_covers: 3, cycle_anchor: null, active_from: null });
  });

  it("reads rows in sort_order, ignores inactive ones and keeps section order", () => {
    const rows = toStaffRows(DEFAULT_STAFF).reverse();
    rows.find((r) => r.id === "marcos")!.active = false;
    const staff = fromStaffRows(rows);
    expect(staff.map((s) => s.id)).not.toContain("marcos");
    expect(staff[0].id).toBe("marta");
  });
});
