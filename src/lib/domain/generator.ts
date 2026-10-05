import { diffDays, isWeekend, monthDates } from "./dates";
import type { GeneratorConfig, GeneratorResult, Schedule, ShiftCode, Staff, Warning } from "./types";

const MONDAY_ANCHOR = "2026-01-05";

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
      // Seniors can't cover T, so never let M take the last person able to do it.
      const canDoT = (r: Staff) => {
        const s = st[r.id];
        return !taken.has(r.id) && s.last !== "N" && s.streak < maxStreak;
      };
      const pool =
        slot === "M" && slots.includes("T") ? eligible.filter((r) => recs.some((o) => o !== r && canDoT(o))) : eligible;
      const score = (r: Staff, i: number) => {
        const s = st[r.id];
        return s.worked * 10 + s.streak * 2 + s[slot] * 8 + ((i + seed + di) % recs.length) * 0.1;
      };
      pool.sort((a, b) => score(a, recs.indexOf(a)) - score(b, recs.indexOf(b)));
      const pick = pool[0];
      if (pick) {
        taken.add(pick.id);
        set(pick.id, d, slot);
        continue;
      }
      if (slot === "M") {
        const cover = seniors
          .filter((s) => schedule[s.id][d] === "P" && seniorCovers[s.id] < maxSeniorMornings)
          .sort((a, b) => seniorCovers[a.id] - seniorCovers[b.id])[0];
        if (cover) {
          seniorCovers[cover.id]++;
          set(cover.id, d, "M");
          continue;
        }
      }
      warnings.push({ date: d, shift: slot, message: `Sin cobertura de ${slot} el ${d}` });
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
