import { describe, expect, it } from "vitest";
import { buildStaff } from "./rosterConfig";

describe("buildStaff", () => {
  it("places the temporary receptionist right after Marcos and applies dates", () => {
    const staff = buildStaff(true, { arturo: { activeFrom: "2026-09-07" }, angela: { activeTo: "2026-09-20" } });
    const ids = staff.map((s) => s.id);
    expect(ids[ids.indexOf("marcos") + 1]).toBe("angela");
    expect(staff.find((s) => s.id === "arturo")!.activeFrom).toBe("2026-09-07");
    expect(staff.find((s) => s.id === "angela")!.activeTo).toBe("2026-09-20");
  });

  it("omits her when not requested and leaves others untouched", () => {
    const staff = buildStaff(false, {});
    expect(staff.some((s) => s.id === "angela")).toBe(false);
    expect(staff.find((s) => s.id === "marta")!.activeFrom).toBeUndefined();
  });
});
