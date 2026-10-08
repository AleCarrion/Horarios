import { describe, expect, it } from "vitest";
import { generateSchedule } from "./generator";
import { DEFAULT_STAFF } from "./roster";
import { monthDates } from "./dates";
import { validateSchedule } from "./validate";
import type { Schedule, ShiftCode } from "./types";

const merge = (a: Schedule, b: Schedule): Schedule =>
  Object.fromEntries(Object.keys(a).map((id) => [id, { ...a[id], ...b[id] }]));

describe("validator across the month boundary", () => {
  it("counts working streaks that started in the previous month", () => {
    const prev = generateSchedule({ year: 2026, month: 10, staff: DEFAULT_STAFF }).schedule;
    // Ana works the last 4 days of October...
    const hist: Schedule = { ...prev, ana: { ...prev.ana } };
    for (const d of ["2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31"]) hist.ana[d] = "P";
    // ...and the first 4 days of November (8 in a row)
    const nov = generateSchedule({ year: 2026, month: 11, staff: DEFAULT_STAFF }).schedule;
    for (const d of ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"]) nov.ana[d] = "P";
    const alone = validateSchedule(nov, DEFAULT_STAFF, 2026, 11).issues.filter((i) => i.kind === "streak" && i.staffId === "ana");
    const withHistory = validateSchedule(nov, DEFAULT_STAFF, 2026, 11, hist).issues.filter((i) => i.kind === "streak" && i.staffId === "ana");
    expect(alone).toHaveLength(0);
    expect(withHistory.length).toBeGreaterThan(0);
  });

  it("counts libre days across the boundary and the night -> shift rule on day 1", () => {
    const prev = generateSchedule({ year: 2026, month: 10, staff: DEFAULT_STAFF }).schedule;
    const hist: Schedule = { ...prev, marcos: { ...prev.marcos, "2026-10-31": "N" } };
    const nov = generateSchedule({ year: 2026, month: 11, staff: DEFAULT_STAFF }).schedule;
    nov.marcos["2026-11-01"] = "M";
    const issues = validateSchedule(nov, DEFAULT_STAFF, 2026, 11, hist).issues.filter((i) => i.kind === "rest" && i.staffId === "marcos");
    expect(issues.length).toBeGreaterThan(0);
  });
});

describe("generating month after month", () => {
  it("12 chained months have no coverage gaps and no streak / rest-run problems at any boundary", () => {
    let history: Schedule | undefined;
    let all: Schedule = Object.fromEntries(DEFAULT_STAFF.map((s) => [s.id, {}]));
    for (let m = 1; m <= 12; m++) {
      const r = generateSchedule({ year: 2026, month: m, staff: DEFAULT_STAFF, history });
      const issues = validateSchedule(r.schedule, DEFAULT_STAFF, 2026, m, history).issues;
      expect(issues, `month ${m}`).toEqual([]);
      all = merge(all, r.schedule);
      history = r.schedule;
    }
    // and the whole year read as one continuous schedule: nobody works 7+ days or rests 4+ days in a row
    const days = [...Array(12).keys()].flatMap((i) => monthDates(2026, i + 1));
    for (const s of DEFAULT_STAFF) {
      let work = 0;
      let rest = 0;
      for (const d of days) {
        const c: ShiftCode = all[s.id][d];
        work = c === "D" || c === "V" || c === "B" ? 0 : work + 1;
        rest = c === "D" ? rest + 1 : 0;
        expect(work, `${s.id} ${d}`).toBeLessThanOrEqual(6);
        if (s.role !== "mozo") expect(rest, `${s.id} ${d}`).toBeLessThanOrEqual(3);
      }
    }
  });

  it("different seeds chain cleanly too", () => {
    for (const seed of [3, 17, 41]) {
      let history: Schedule | undefined;
      for (let m = 1; m <= 6; m++) {
        const r = generateSchedule({ year: 2026, month: m, staff: DEFAULT_STAFF, history, seed });
        expect(validateSchedule(r.schedule, DEFAULT_STAFF, 2026, m, history).issues, `seed ${seed} month ${m}`).toEqual([]);
        history = r.schedule;
      }
    }
  });
});

import { planDayOff, planShiftSwap } from "./repair";
import { isOff } from "./types";

describe("requests near the end of the month respect the next month", () => {
  const oct = generateSchedule({ year: 2026, month: 10, staff: DEFAULT_STAFF }).schedule;
  const nov = generateSchedule({ year: 2026, month: 11, staff: DEFAULT_STAFF, history: oct }).schedule;
  const recs = DEFAULT_STAFF.filter((s) => s.role === "receptionist");

  it("a day off at the very end of October never breaks November's first days", () => {
    for (const r of recs)
      for (const d of ["2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31"]) {
        if (isOff(oct[r.id][d])) continue;
        const plan = planDayOff({ year: 2026, month: 10, staff: DEFAULT_STAFF, schedule: oct, next: nov }, r.id, d);
        expect(plan.level === "red" ? true : validateSchedule(nov, DEFAULT_STAFF, 2026, 11, plan.schedule).issues.filter((i) => i.date <= "2026-11-08" && ["streak", "restStreak", "rest"].includes(i.kind))).toEqual(plan.level === "red" ? true : []);
      }
  });

  it("history is honoured when planning inside November", () => {
    const who = recs.find((r) => !isOff(nov[r.id]["2026-11-03"]))!;
    const plan = planDayOff({ year: 2026, month: 11, staff: DEFAULT_STAFF, schedule: nov, history: oct }, who.id, "2026-11-03");
    if (plan.level !== "red") expect(validateSchedule(plan.schedule, DEFAULT_STAFF, 2026, 11, oct).issues).toEqual([]);
  });

  it("a shift swap on the last day keeps both months valid", () => {
    const day = "2026-10-31";
    const pair = recs.flatMap((a) => recs.filter((b) => a.id < b.id).map((b) => [a.id, b.id])).find(([a, b]) => !isOff(oct[a][day]) && !isOff(oct[b][day]) && oct[a][day] !== oct[b][day]);
    if (!pair) return;
    const plan = planShiftSwap({ year: 2026, month: 10, staff: DEFAULT_STAFF, schedule: oct, next: nov }, pair[0], pair[1], day);
    if (plan.level !== "red") expect(validateSchedule(nov, DEFAULT_STAFF, 2026, 11, plan.schedule).issues.filter((i) => i.date <= "2026-11-08")).toEqual([]);
  });
});
