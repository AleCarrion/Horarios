import { monthDates } from "./dates";
import { planFix, firstEditable, type Plan, type RepairContext, type CellChange } from "./repair";
import { summarizeMonth, type PersonSummary } from "./summary";
import { isActive, isFixedCell, type Schedule, type ShiftCode, type Staff } from "./types";

const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
};

/**
 * The previous month's pattern laid over this month: every day takes what the same person did exactly four weeks earlier
 * (so Mondays stay Mondays and the weekly rhythm is kept). Whatever is already decided here is left alone:
 * holidays/absences/out-of-roster days, locked cells, days that have already happened, and the mozos (their own 5/5 cycle).
 */
export function layPattern(ctx: RepairContext, previous: Schedule): Schedule {
  const first = firstEditable(ctx);
  const out: Schedule = {};
  for (const s of ctx.staff) {
    const row: Record<string, ShiftCode> = { ...(ctx.schedule[s.id] ?? {}) };
    if (s.role !== "mozo") {
      for (const d of monthDates(ctx.year, ctx.month)) {
        const here = ctx.schedule[s.id]?.[d];
        const fixed = isFixedCell(here) || ctx.locked?.[s.id]?.[d] || (first !== null && d < first) || !isActive(s, d);
        if (fixed) continue;
        const was = previous[s.id]?.[addDays(d, -28)];
        if (!was) continue;
        // a holiday / absence last month is not a pattern: that day becomes a normal rest
        row[d] = isFixedCell(was) ? "D" : was;
      }
    }
    out[s.id] = row;
  }
  return out;
}

/** "Copiar el patrón del mes anterior": the pattern laid over this month, repaired with the fewest changes, shown as a plan. */
export function planCopyPattern(ctx: RepairContext, previous: Schedule): Plan {
  const laid = layPattern(ctx, previous);
  const fixed = planFix({ ...ctx, schedule: laid, history: previous });
  const schedule = fixed.schedule;
  const changes: CellChange[] = [];
  for (const s of ctx.staff)
    for (const date of monthDates(ctx.year, ctx.month)) {
      const to = schedule[s.id]?.[date];
      const from = ctx.schedule[s.id]?.[date];
      if (to && to !== from) changes.push({ staffId: s.id, date, from, to });
    }
  return { ...fixed, strategy: "restructure", schedule, changes, pins: [] };
}

export interface MonthDelta {
  staffId: string;
  a: PersonSummary;
  b: PersonSummary;
}

/** Side by side numbers of two months for everyone who worked in at least one of them. */
export function compareMonths(staff: Staff[], a: { schedule: Schedule; year: number; month: number }, b: { schedule: Schedule; year: number; month: number }): MonthDelta[] {
  const sa = summarizeMonth(a.schedule, staff, a.year, a.month);
  const sb = summarizeMonth(b.schedule, staff, b.year, b.month);
  return staff
    .map((s, i) => ({ staffId: s.id, a: sa[i], b: sb[i] }))
    .filter((r) => r.a.worked + r.a.libres + r.a.vacaciones + r.b.worked + r.b.libres + r.b.vacaciones > 0);
}

