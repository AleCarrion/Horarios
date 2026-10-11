import { describe, expect, it } from "vitest";
import { DEFAULT_RULES } from "./domain/ruleset";
import { fromRulesRow, toRulesRow } from "./rulesSync";

describe("reglas ↔ servidor", () => {
  it("round trip", () => {
    const r = { ...DEFAULT_RULES, maxRestRun: 4, localHolidays: ["03-19"] };
    expect(fromRulesRow(toRulesRow(r))).toEqual(r);
  });
  it("a damaged or foreign row never produces unusable rules", () => {
    expect(fromRulesRow({ rules: { maxRestRun: "mucho", localHolidays: ["x"] } })).toEqual(DEFAULT_RULES);
    expect(fromRulesRow({ rules: null })).toEqual(DEFAULT_RULES);
  });
});
