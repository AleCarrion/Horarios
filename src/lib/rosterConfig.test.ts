import { describe, expect, it } from "vitest";
import { buildStaff } from "./rosterConfig";

describe("buildStaff", () => {
  it("applies alta/baja dates and leaves others untouched", () => {
    const staff = buildStaff({ arturo: { activeFrom: "2026-09-07" }, "alberto-m": { activeTo: "2026-09-30" } });
    expect(staff.find((s) => s.id === "arturo")!.activeFrom).toBe("2026-09-07");
    expect(staff.find((s) => s.id === "alberto-m")!.activeTo).toBe("2026-09-30");
    expect(staff.find((s) => s.id === "marta")!.activeFrom).toBeUndefined();
  });
});
