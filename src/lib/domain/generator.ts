import { validateSchedule } from "./validate";
import { diffDays, isWeekend, monthDates } from "./dates";
import { isActive, isOff, type GeneratorConfig, type GeneratorResult, type Schedule, type ShiftCode, type Staff, type Warning } from "./types";

/** Extra "workload days" a covering senior counts as having, so receptionists are preferred but seniors still share M/T. */
const SENIOR_PENALTY = 100;
/** Receptionists rotate in blocks of the same shift (BLOCK_MIN..BLOCK_MAX days) with at least MIN_REST days off between blocks. */
const BLOCK_MIN = 3;
const BLOCK_MAX = 5;
const MIN_REST = 2;
/** Hard legal limit of consecutive working days; going past the preferred maxStreak (5) up to this is a last resort. */
const LEGAL_STREAK = 6;
/** Nobody but mozos (or people on holiday) rests more than this many days in a row. */
const MAX_REST_RUN = 3;
/** When repairing a schedule, how much the planner prefers keeping someone on the shift they already had. */
const BASELINE_KEEP = 80;

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

/**
 * Rest days for the partido/senior group: blocks of 2 days (a single day when the quota is odd) that
 * alternate between seniors, with a work day or two in between, so at least one senior is always in
 * and nobody works more than ~5 days in a row. Mirrors the hotel's real rota (10 rest days each).
 */
export function planSeniorRests(dates: string[], seniorIds: string[], quota: number, seed = 0): Record<string, Set<string>> {
  const n = seniorIds.length;
  const rests: Record<string, Set<string>> = Object.fromEntries(seniorIds.map((id) => [id, new Set<string>()]));
  if (!n || quota <= 0) return rests;
  const perSenior = Math.ceil(quota / 2);
  const blocks = n * perSenior;
  const slack = Math.max(0, dates.length - n * quota);
  const gap = Math.floor(slack / (blocks + 1));
  let extra = slack - gap * (blocks + 1);
  const gaps = Array.from({ length: blocks + 1 }, (_, i) => gap + ((i + seed) % (blocks + 1) < extra ? 1 : 0));
  extra = 0;
  const remaining = Object.fromEntries(seniorIds.map((id) => [id, quota]));
  let pos = gaps[0];
  for (let k = 0; k < blocks; k++) {
    const id = seniorIds[(k + seed) % n];
    const len = Math.min(2, remaining[id]);
    for (let j = 0; j < len && pos + j < dates.length; j++) rests[id].add(dates[pos + j]);
    remaining[id] -= len;
    pos += len + gaps[k + 1];
  }
  return rests;
}

export function generateOnce(config: GeneratorConfig): GeneratorResult {
  const { year, month, staff } = config;
  const maxStreak = config.maxStreak ?? 5;
  const maxSeniorMornings = config.maxSeniorMornings ?? 6;
  const seed = config.seed ?? 0;
  const dates = monthDates(year, month);
  const byRole = (r: Staff["role"]) => staff.filter((s) => s.role === r);
  const schedule: Schedule = Object.fromEntries(staff.map((s) => [s.id, {}]));
  const warnings: Warning[] = [];
  const set = (id: string, d: string, c: ShiftCode) => {
    schedule[id][d] = c;
  };

  const byId = new Map(staff.map((x) => [x.id, x]));
  const pin = (id: string, d: string) => config.pinned?.[id]?.[d];
  /** "V" (holiday), "B" (not employed: outside alta/baja or marked by hand) or "D" (pinned libre); undefined when the person may work. */
  const offCode = (id: string, d: string): "V" | "B" | "D" | undefined => {
    const person = byId.get(id);
    if (person && !isActive(person, d)) return "B";
    const p = pin(id, d);
    if (p === "V" || p === "B" || p === "D") return p;
    return config.unavailable?.[id]?.[d];
  };
  /** A pinned working shift (e.g. a frozen "T"), if any. */
  const pinnedWork = (id: string, d: string) => {
    const p = pin(id, d);
    return p && !isOff(p) ? p : undefined;
  };

  // Without a night auditor on the team every night has to be covered by receptionists.
  const jcRest = new Set(
    byRole("night_auditor").length === 0
      ? dates
      : (config.jcRestDays ?? autoJcRestDays(dates, config.jcRestCount ?? 10)),
  );
  // JC's holidays leave their nights uncovered just like rest days do; a pinned night is never a rest.
  for (const jc of byRole("night_auditor"))
    for (const d of dates) {
      if (offCode(jc.id, d)) jcRest.add(d);
      else if (pinnedWork(jc.id, d) === "N") jcRest.delete(d);
    }

  // Fixed staff
  for (const jc of byRole("night_auditor"))
    for (const d of dates) set(jc.id, d, offCode(jc.id, d) ?? (jcRest.has(d) ? "D" : "N"));
  for (const m of byRole("director"))
    for (const d of dates) set(m.id, d, offCode(m.id, d) ?? pinnedWork(m.id, d) ?? (isWeekend(d) ? "D" : "S"));
  for (const mz of byRole("mozo")) {
    for (const d of dates) {
      const phase = (((diffDays(d, mz.cycleAnchor ?? dates[0]) % 10) + 10) % 10);
      set(mz.id, d, offCode(mz.id, d) ?? pinnedWork(mz.id, d) ?? (phase < 5 ? "MZ" : "D"));
    }
  }
  const seniors = byRole("senior");
  const planned = planSeniorRests(
    dates,
    seniors.map((x) => x.id),
    config.seniorRestCount ?? 10,
    seed,
  );
  for (const sr of seniors) {
    const extra = new Set(config.seniorRestDays?.[sr.id] ?? []);
    for (const d of dates) {
      // repairing: keep the planned rests of the baseline; otherwise use the senior rest plan
      const b = config.baseline?.[sr.id]?.[d];
      const rest = b ? b === "D" : planned[sr.id].has(d) || extra.has(d);
      set(sr.id, d, offCode(sr.id, d) ?? (rest ? "D" : "P"));
    }
  }

  // Receptionists: day-by-day greedy with hard rest rules and fairness scoring
  const recs = byRole("receptionist");
  const st = Object.fromEntries(
    recs.map((r) => [
      r.id,
      {
        last: (config.prevDay?.[r.id] ?? "D") as ShiftCode,
        streak: 0,
        worked: 0,
        M: 0,
        T: 0,
        N: 0,
        blockLen: config.prevDay?.[r.id] && config.prevDay[r.id] !== "D" ? 1 : 0,
        restRun: MIN_REST,
        dRun: 0,
        target: BLOCK_MIN,
      },
    ]),
  );
  const maxNights = Math.max(1, Math.ceil(jcRest.size / Math.max(1, recs.length)));
  const seniorCovers: Record<string, number> = Object.fromEntries(seniors.map((s) => [s.id, 0]));
  const seniorLast: Record<string, ShiftCode> = Object.fromEntries(
    seniors.map((s) => [s.id, (config.prevDay?.[s.id] ?? "D") as ShiftCode]),
  );
  const seniorBlock: Record<string, number> = Object.fromEntries(seniors.map((s) => [s.id, 0]));
  const coverCap = (s: Staff) => s.maxCovers ?? maxSeniorMornings;
  const seniorsFor = (slot: "M" | "T", d: string, ignoreCap = false) =>
    seniors.filter(
      (s) =>
        schedule[s.id][d] === "P" &&
        !pinnedWork(s.id, d) &&
        s.extraShifts?.includes(slot) &&
        (ignoreCap || seniorCovers[s.id] < coverCap(s)) &&
        !(slot === "M" && seniorLast[s.id] === "T"),
    );

  dates.forEach((d, di) => {
    const slots: ("N" | "T" | "M")[] = jcRest.has(d) ? ["N", "M", "T"] : ["M", "T"];
    // a pinned shift on a day that would not normally need it still has to be planned (e.g. a pinned night)
    for (const x of [...recs, ...seniors]) {
      const w = pinnedWork(x.id, d);
      if ((w === "N" || w === "M" || w === "T") && !slots.includes(w)) slots.push(w);
    }
    const taken = new Set<string>();
    for (const slot of slots) {
      // pinned occupant of this slot (frozen/approved assignment): it stays, nothing to decide
      const holder = [...recs, ...seniors].find((x) => !taken.has(x.id) && pinnedWork(x.id, d) === slot);
      if (holder) {
        taken.add(holder.id);
        set(holder.id, d, slot);
        if (holder.role === "senior") seniorCovers[holder.id]++;
        continue;
      }
      const eligible = recs.filter((r) => {
        const s = st[r.id];
        if (taken.has(r.id) || s.streak >= maxStreak || offCode(r.id, d)) return false;
        if (pinnedWork(r.id, d) && pinnedWork(r.id, d) !== slot) return false; // pinned to another slot
        if (slot === "N" && s.N >= maxNights) return false; // share night cover: nobody gets stuck with 6
        if (s.last === "N" && slot !== "N") return false;
        if (slot === "M" && s.last === "T") return false;
        return true;
      });
      // M must not take the last receptionist able to do T unless a senior can back T up.
      const canDoT = (r: Staff) => {
        const s = st[r.id];
        return !taken.has(r.id) && !offCode(r.id, d) && s.last !== "N" && s.streak < maxStreak;
      };
      const tBackup = slot === "M" && seniorsFor("T", d).length > 0;
      const pool =
        slot === "M" && !tBackup ? eligible.filter((r) => recs.some((o) => o !== r && canDoT(o))) : eligible;
      const score = (r: Staff, i: number) => {
        const s = st[r.id];
        let v = s.worked * 14 + s.streak + s[slot] * (slot === "N" ? 40 : 4) + ((i + seed + di) % recs.length) * 0.1;
        if (s.last === slot) v += s.blockLen < BLOCK_MIN ? -70 : s.blockLen < s.target ? -35 : 30; // finish a started block, then end it at its target
        else if (s.last !== "D") v += 25; // avoid switching shift without a rest day
        else if (s.restRun < MIN_REST) v += 30; // rest at least MIN_REST days between blocks
        const was = config.baseline?.[r.id]?.[d];
        if (was === slot) v -= config.baselineKeep ?? BASELINE_KEEP; // repairing: keep people on the shift they already had
        else if (was && isOff(was)) v += (config.baselineKeep ?? BASELINE_KEEP) / 2.5; // ...and keep their rest days
        if (s.dRun >= MAX_REST_RUN) v -= 150; // already rested the maximum: must work today
        else if (s.dRun === MAX_REST_RUN - 1) v -= 40;
        return v;
      };
      const candidates: { id: string; score: number; senior: boolean }[] = pool.map((r) => ({
        id: r.id,
        score: score(r, recs.indexOf(r)),
        senior: false,
      }));
      if (slot !== "N")
        for (const s of seniorsFor(slot, d).filter((x) => !taken.has(x.id)))
          candidates.push({
            id: s.id,
            score:
              seniorCovers[s.id] * 10 +
              SENIOR_PENALTY +
              (seniorLast[s.id] === slot ? (seniorBlock[s.id] < BLOCK_MAX - 1 ? -30 : 30) : 0) -
              (config.baseline?.[s.id]?.[d] === slot ? (config.baselineKeep ?? BASELINE_KEEP) : 0),
            senior: true,
          });
      candidates.sort((a, b) => a.score - b.score);
      let pick = candidates[0];
      if (!pick) {
        // Everyone is at the preferred limit: a legal 6th working day (or an extra night) beats an uncovered shift.
        const relaxed = recs
          .filter((r) => {
            const s = st[r.id];
            if (taken.has(r.id) || s.streak >= LEGAL_STREAK || offCode(r.id, d)) return false;
            if (s.last === "N" && slot !== "N") return false;
            return !(slot === "M" && s.last === "T");
          })
          .sort((a, b) => score(a, recs.indexOf(a)) - score(b, recs.indexOf(b)))[0];
        if (relaxed) {
          pick = { id: relaxed.id, score: 0, senior: false };
          warnings.push({
            kind: "streak",
            date: d,
            shift: slot,
            message: `${relaxed.name} trabaja ${st[relaxed.id].streak + 1} días seguidos el ${d} para cubrir ${slot}`,
          });
        }
      }
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
      const off = offCode(r.id, d);
      const code = off ?? (taken.has(r.id) ? (schedule[r.id][d] as ShiftCode) : "D");
      set(r.id, d, code);
      s.dRun = code === "D" ? s.dRun + 1 : 0; // holidays (V/B) do not count towards the 3-day rest limit
      // Holidays and days before an alta count as "worked" for fairness, so nobody has to catch up after them
      // (a new hire or someone back from holiday does not absorb everyone else's shifts).
      if (code === "V" || code === "B") s.worked++;
      if (isOff(code)) {
        s.streak = 0;
        s.blockLen = 0;
        s.restRun = code === "D" ? s.restRun + 1 : MIN_REST;
      } else {
        s.streak++;
        s.worked++;
        s[code as "M" | "T" | "N"]++;
        s.restRun = 0;
        if (code === s.last) s.blockLen++;
        else {
          s.blockLen = 1;
          s.target = BLOCK_MIN + ((seed + di + recs.indexOf(r)) % (BLOCK_MAX - BLOCK_MIN + 1));
        }
      }
      s.last = isOff(code) ? "D" : code;
    }
    for (const s of seniors) {
      const code = schedule[s.id][d];
      seniorBlock[s.id] = code === seniorLast[s.id] && (code === "M" || code === "T") ? seniorBlock[s.id] + 1 : 1;
      seniorLast[s.id] = code;
    }
  });

  const stats: GeneratorResult["stats"] = {};
  for (const s of staff) {
    const vals = dates.map((d) => schedule[s.id][d]);
    stats[s.id] = {
      worked: vals.filter((v) => !isOff(v)).length,
      rest: vals.filter((v) => v === "D").length,
      off: vals.filter((v) => v === "V" || v === "B").length,
      M: vals.filter((v) => v === "M").length,
      T: vals.filter((v) => v === "T").length,
      N: vals.filter((v) => v === "N").length,
    };
  }
  return { schedule, warnings, stats };
}

const ATTEMPTS = 24;

/**
 * The generator is a greedy day-by-day planner, so an unlucky tie-break can leave a gap or a long rest.
 * Try a few deterministic variations (seed, seed+1, ...) and keep the best; stop at the first clean one.
 */
export function generateSchedule(config: GeneratorConfig): GeneratorResult {
  const seed = config.seed ?? 0;
  let best: { result: GeneratorResult; cost: number } | null = null;
  for (let i = 0; i < ATTEMPTS; i++) {
    const result = generateOnce({ ...config, seed: seed + i });
    const issues = validateSchedule(result.schedule, config.staff, config.year, config.month).issues;
    const hard = issues.filter((x) => x.kind === "coverage" || x.kind === "restStreak" || x.kind === "streak").length;
    const soft = result.warnings.filter((w) => w.kind === "cap" || w.kind === "streak").length;
    const cost = hard * 1000 + soft;
    if (!best || cost < best.cost) best = { result, cost };
    if (cost === 0) break;
  }
  return best!.result;
}
