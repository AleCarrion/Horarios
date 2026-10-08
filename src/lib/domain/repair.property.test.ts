import { describe, expect, it } from "vitest";
import { generateSchedule } from "./generator";
import { DEFAULT_STAFF } from "./roster";
import { monthDates } from "./dates";
import { firstEditable, planDayOff, planRestructure, planShiftSwap, type Plan, type RepairContext } from "./repair";
import { isOff, type Schedule, type Staff } from "./types";
import { validateSchedule } from "./validate";
import { OCTOBER_2026_REAL } from "./fixtures/october-2026";

/** Small deterministic PRNG so failures are reproducible. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(r: () => number, xs: T[]) => xs[Math.floor(r() * xs.length)];
const HARD = ["coverage", "forbidden", "rest", "streak", "restStreak"];
const key = (i: { kind: string; staffId?: string; date: string; message: string }) => `${i.kind}|${i.staffId ?? ""}|${i.date}|${i.message}`;

interface Scenario {
  name: string;
  ctx: RepairContext;
  plan: Plan;
  /** cells that were asked for and must be honoured (or the request refused) */
  asked: { staffId: string; date: string; to: string }[];
  newStaff?: Staff[];
}

function scenario(seed: number): Scenario {
  const r = rng(seed);
  const month = 1 + Math.floor(r() * 12);
  const year = 2026;
  const dates = monthDates(year, month);
  const prevM = month === 1 ? { y: 2025, m: 12 } : { y: year, m: month - 1 };
  const history = generateSchedule({ year: prevM.y, month: prevM.m, staff: DEFAULT_STAFF }).schedule;
  const schedule = generateSchedule({ year, month, staff: DEFAULT_STAFF, history }).schedule;
  const locked: Record<string, Record<string, boolean>> = {};
  for (let i = 0; i < 12; i++) (locked[pick(r, DEFAULT_STAFF).id] ??= {})[pick(r, dates)] = true;
  const today = r() < 0.5 ? dates[Math.floor(r() * 10)] : undefined;
  const ctx: RepairContext = { year, month, staff: DEFAULT_STAFF, schedule, history, locked, today };
  const people = DEFAULT_STAFF.filter((s) => s.role === "receptionist" || s.role === "senior");
  const who = pick(r, people);
  const day = pick(r, dates.slice(0, dates.length - 3));
  const kind = r();
  if (kind < 0.4) return { name: `libre ${who.id} ${day}`, ctx, plan: planDayOff(ctx, who.id, day), asked: [{ staffId: who.id, date: day, to: "D" }] };
  if (kind < 0.6) {
    const to = dates[Math.min(dates.indexOf(day) + 1 + Math.floor(r() * 3), dates.length - 1)];
    const span = dates.filter((x) => x >= day && x <= to);
    return { name: `vacaciones ${who.id} ${day}-${to}`, ctx, plan: planDayOff(ctx, who.id, day, "V", to), asked: span.map((x) => ({ staffId: who.id, date: x, to: "V" })) };
  }
  if (kind < 0.85) {
    const other = pick(r, people.filter((p) => p.id !== who.id));
    return { name: `cambio ${who.id}<->${other.id} ${day}`, ctx, plan: planShiftSwap(ctx, who.id, other.id, day), asked: [] };
  }
  const leaver = pick(r, DEFAULT_STAFF.filter((s) => s.role === "receptionist"));
  const newStaff = DEFAULT_STAFF.map((s) => (s.id === leaver.id ? { ...s, activeTo: dates[Math.floor(dates.length / 2)] } : s));
  return { name: `baja ${leaver.id}`, ctx, plan: planRestructure(ctx, newStaff, dates[0]), asked: [], newStaff };
}

describe("repair engine: invariants over random scenarios", () => {
  const seeds = Array.from({ length: Number(process.env.PROP_SEEDS ?? 150) }, (_, i) => i + 1);

  it("never changes locked or protected cells, honours what was asked, explains every red", () => {
    for (const seed of seeds) {
      const { name, ctx, plan, asked } = scenario(seed);
      const label = `${seed}: ${name}`;
      const first = firstEditable(ctx);
      for (const c of plan.changes) {
        // a baja/alta date overrides a lock: the person is simply not on the roster that day ("B")
        if (c.to !== "B") expect(ctx.locked?.[c.staffId]?.[c.date] ?? false, `${label} touched a locked cell ${c.staffId} ${c.date}`).toBe(false);
        if (first) expect(c.date >= first, `${label} changed a protected day ${c.date}`).toBe(true);
      }
      if (plan.level === "red") expect(plan.reason, label).toBeTruthy();
      else for (const a of asked) expect(plan.schedule[a.staffId][a.date], label).toBe(a.to);
      // the reported changes are exactly the difference with the original
      const real = DEFAULT_STAFF.flatMap((s) => monthDates(ctx.year, ctx.month).filter((x) => plan.schedule[s.id]?.[x] !== ctx.schedule[s.id][x]).map((x) => `${s.id}|${x}`));
      expect(plan.changes.map((c) => `${c.staffId}|${c.date}`).sort(), label).toEqual(real.sort());
    }
  }, 120_000);

  it("a non-red plan never introduces a new rule violation", () => {
    for (const seed of seeds) {
      const { name, ctx, plan, newStaff } = scenario(seed);
      if (plan.level === "red") continue;
      const staff = newStaff ?? ctx.staff;
      const before = new Set(validateSchedule(ctx.schedule, ctx.staff, ctx.year, ctx.month, ctx.history).issues.map(key));
      const fresh = validateSchedule(plan.schedule, staff, ctx.year, ctx.month, ctx.history).issues.filter((i) => HARD.includes(i.kind) && (newStaff ? true : !before.has(key(i))));
      expect(fresh, `${seed}: ${name}`).toEqual([]);
    }
  }, 120_000);

  it("is deterministic and fast", () => {
    for (const seed of seeds.slice(0, 20)) {
      const t0 = performance.now();
      const a = scenario(seed);
      const ms = performance.now() - t0;
      const b = scenario(seed);
      expect(a.plan.schedule, `${seed}: ${a.name}`).toEqual(b.plan.schedule);
      expect(ms, `${seed}: ${a.name} took ${ms}ms`).toBeLessThan(3000);
    }
  });
});

describe("repair engine on the real October 2026 rota", () => {
  const ids: Record<string, string> = { director: "marta", senior_a: "ana", senior_b: "julio", recep_1: "alberto-r", recep_2: "marcos", recep_3: "alejandro", night_auditor: "jc", mozo_1: "alberto-m", mozo_2: "arturo" };
  const dates = monthDates(2026, 10);
  const real: Schedule = {};
  for (const [pos, row] of Object.entries(OCTOBER_2026_REAL))
    real[ids[pos]] = Object.fromEntries([...row].map((c, i) => [dates[i], c === "." ? "D" : c === "z" ? "MZ" : c])) as Schedule[string];

  it("can give almost any receptionist or partido worker a day off on the real schedule", () => {
    let total = 0;
    let ok = 0;
    for (const id of ["alberto-r", "marcos", "alejandro", "julio", "ana"])
      for (const d of dates) {
        if (isOff(real[id][d])) continue;
        total++;
        const plan = planDayOff({ year: 2026, month: 10, staff: DEFAULT_STAFF, schedule: real }, id, d);
        if (plan.level !== "red" && plan.schedule[id][d] === "D") ok++;
      }
    expect(total).toBeGreaterThan(60);
    expect(ok / total).toBeGreaterThan(0.9);
  });
});
