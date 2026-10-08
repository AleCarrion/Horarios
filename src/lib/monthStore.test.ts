import { describe, expect, it } from "vitest";
import { lockedCount, setLocked } from "./monthStore";

describe("locks", () => {
  it("locks and unlocks cells without mutating the input", () => {
    const a = setLocked({}, [{ staffId: "marcos", date: "2026-11-14" }, { staffId: "marcos", date: "2026-11-15" }], true);
    expect(lockedCount(a)).toBe(2);
    const b = setLocked(a, [{ staffId: "marcos", date: "2026-11-14" }], false);
    expect(lockedCount(b)).toBe(1);
    expect(lockedCount(a)).toBe(2);
    expect(b.marcos["2026-11-15"]).toBe(true);
  });
});
