import { diffDays, isWeekend, monthDates } from "./dates";
import type { GeneratorConfig, GeneratorResult, Schedule, ShiftCode, Staff, Warning } from "./types";

const MONDAY_ANCHOR = "2026-01-05";
/** Extra "workload days" a covering senior counts as having, so receptionists are preferred but seniors still share M/T. */
const SENIOR_PENALTY = 45;

/** Spread `count` rest days in blocks of two, evenly through the month. */
export function autoJcRestDays(dates: string[], count: number): string[] {
  const pairs = Math.floor(count / 2);
  const picked = new Set<number>();
  for (let k = 0; k < pairs; k++) {
    const start = Math.floor(((k + 0.5) * dates.length) / pairs);
    picked.add(start);
    picked.add(start + 1);
  }
  if (count % 2 === 1) picked.add(Math.floor(dates.length / 2) + 3);
  return [...picked].filter((i) => i < dates.length).map((i) => dates[i]);
}

export function generateSchedule(config: GeneratorConfig): GeneratorResult {
  const { year, month, staff } = config;
  const maxStreak = config.maxStreak ?? 6;
  const maxSeniorMornings = config.maxSeniorMornings ?? 6;
  const seed = config.seed ?? 0;
  const dates = monthDates(year, month);
  const byRole = (r: Staff["role"]) => staff.filter((s) => s.role === r);
  const schedule: Schedule = Object.fromEntries(staff.map((s) => [s.id, {}]));
  const warnings: Warning[] = [];
  const set = (id: string, d: string, c: ShiftCode) => {
    schedule[id][d] = c;
  };

  const jcRest = new Set(
    config.jcRestDays ?? autoJcRestDays(dates, config.jcRestCount ?? 10),
  );

  // Fixed staff
  for (const jc of byRole("night_auditor")) for (const d of dates) set(jc.id, d, jcRest.has(d) ? "D" : "N");
  for (const m of byRole("director")) for (const d of dates) set(m.id, d, isWeekend(d) ? "D" : "S");
  for (const mz of byRole("mozo")) {
    for (const d of dates) {
      const phase = (((diffDays(d, mz.cycleAnchor ?? dates[0]) % 10) + 10) % 10);
      set(mz.id, d, phase < 5 ? "MZ" : "D");
    }
  }
  const seniors = byRole("senior");
  seniors.forEach((s, idx) => {
    const extra = new Set(config.seniorRestDays?.[s.id] ?? []);
    for (const d of dates) {
      let works = true;
      if (isWeekend(d)) {
        const week = Math.floor(diffDays(d, MONDAY_ANCHOR) / 7);
        works = ((week % seniors.length) + seniors.length) % seniors.length === idx;
      }
      set(s.id, d, works && !extra.has(d) ? "P" : "D");
    }
  });

  // Receptionists: day-by-day greedy with hard rest rules and fairness scoring
  const recs = byRole("receptionist");
  const st = Object.fromEntries(
    recs.map((r) => [
      r.id,
      { last: (config.prevDay?.[r.id] ?? "D") as ShiftCode, streak: 0, worked: 0, M: 0, T: 0, N: 0 },
    ]),
  );
  const seniorCovers: Record<string, number> = Object.fromEntries(seniors.map((s) => [s.id, 0]));
  const seniorLast: Record<string, ShiftCode> = Object.fromEntries(
    seniors.map((s) => [s.id, (config.prevDay?.[s.id] ?? "D") as ShiftCode]),
  );
  const coverCap = (s: Staff) => s.maxCovers ?? maxSeniorMornings;
  const seniorsFor = (slot: "M" | "T", d: string, ignoreCap = false) =>
    seniors.filter(
      (s) =>
        schedule[s.id][d] === "P" &&
        s.extraShifts?.includes(slot) &&
        (ignoreCap || seniorCovers[s.id] < coverCap(s)) &&
        !(slot === "M" && seniorLast[s.id] === "T"),
    );

  dates.forEach((d, di) => {
    const slots: ("N" | "T" | "M")[] = jcRest.has(d) ? ["N", "M", "T"] : ["M", "T"];
    const taken = new Set<string>();
    for (const slot of slots) {
      const eligible = recs.filter((r) => {
        const s = st[r.id];
        if (taken.has(r.id) || s.last === "N" || s.streak >= maxStreak) return false;
        if (slot === "M" && s.last === "T") return false;
        return true;
      });
      // M must not take the last receptionist able to do T unless a senior can back T up.
      const canDoT = (r: Staff) => {
        const s = st[r.id];
        return !taken.has(r.id) && s.last !== "N" && s.streak < maxStreak;
      };
      const tBackup = slot === "M" && seniorsFor("T", d).length > 0;
      const pool =
        slot === "M" && !tBackup ? eligible.filter((r) => recs.some((o) => o !== r && canDoT(o))) : eligible;
      const score = (r: Staff, i: number) => {
        const s = st[r.id];
        return s.worked * 10 + s.streak * 2 + s[slot] * 8 + ((i + seed + di) % recs.length) * 0.1;
      };
      const candidates: { id: string; score: number; senior: boolean }[] = pool.map((r) => ({
        id: r.id,
        score: score(r, recs.indexOf(r)),
        senior: false,
      }));
      if (slot !== "N")
        for (const s of seniorsFor(slot, d).filter((x) => !taken.has(x.id)))
          candidates.push({ id: s.id, score: seniorCovers[s.id] * 10 + SENIOR_PENALTY, senior: true });
      candidates.sort((a, b) => a.score - b.score);
      let pick = candidates[0];
      if (!pick && slot !== "N") {
        // Last resort: a senior over their cap beats an uncovered shift.
        const over = seniorsFor(slot, d, true).find((x) => !taken.has(x.id));
        if (over) {
          pick = { id: over.id, score: 0, senior: true };
          warnings.push({ kind: "cap", date: d, shift: slot, message: `${over.name} supera su tope de coberturas el ${d}` });
        }
      }
      if (pick) {
        taken.add(pick.id);
        set(pick.id, d, slot);
        if (pick.senior) seniorCovers[pick.id]++;
        continue;
      }
      warnings.push({ kind: "coverage", date: d, shift: slot, message: `Sin cobertura de ${slot} el ${d}` });
    }
    for (const r of recs) {
      const s = st[r.id];
      const code = taken.has(r.id) ? (schedule[r.id][d] as ShiftCode) : "D";
      set(r.id, d, code);
      if (code === "D") s.streak = 0;
      else {
        s.streak++;
        s.worked++;
        s[code as "M" | "T" | "N"]++;
      }
      s.last = code;
    }
    for (const s of seniors) seniorLast[s.id] = schedule[s.id][d];
  });

  const stats: GeneratorResult["stats"] = {};
  for (const s of staff) {
    const vals = dates.map((d) => schedule[s.id][d]);
    stats[s.id] = {
      worked: vals.filter((v) => v !== "D").length,
      rest: vals.filter((v) => v === "D").length,
      M: vals.filter((v) => v === "M").length,
      T: vals.filter((v) => v === "T").length,
      N: vals.filter((v) => v === "N").length,
    };
  }
  return { schedule, warnings, stats };
}
