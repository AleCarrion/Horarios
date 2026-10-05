import { monthDates } from "./dates";
import type { Schedule, ShiftCode, Staff } from "./types";

export interface Coverage {
  M: number;
  T: number;
  N: number;
  ok: boolean;
}

export interface Issue {
  kind: "coverage" | "forbidden" | "rest";
  date: string;
  staffId?: string;
  message: string;
}

export interface Validation {
  coverage: Record<string, Coverage>;
  issues: Issue[];
}

const ALLOWED: Record<Staff["role"], ShiftCode[]> = {
  night_auditor: ["N", "D"],
  director: ["S", "D"],
  senior: ["P", "M", "D"],
  receptionist: ["M", "T", "N", "D"],
  mozo: ["MZ", "D"],
};

/** Each of M/T/N needs exactly one person per day; extra people are flagged as over-coverage. */
export function validateSchedule(schedule: Schedule, staff: Staff[], year: number, month: number): Validation {
  const dates = monthDates(year, month);
  const coverage: Record<string, Coverage> = {};
  const issues: Issue[] = [];

  for (const d of dates) {
    const c = { M: 0, T: 0, N: 0, ok: true };
    for (const s of staff) {
      const code = schedule[s.id]?.[d];
      if (code === "M" || code === "T" || code === "N") c[code]++;
    }
    c.ok = c.M === 1 && c.T === 1 && c.N === 1;
    coverage[d] = c;
    for (const k of ["M", "T", "N"] as const) {
      if (c[k] === 0) issues.push({ kind: "coverage", date: d, message: `Falta cobertura de ${k} el ${d}` });
      if (c[k] > 1) issues.push({ kind: "coverage", date: d, message: `Exceso de cobertura de ${k} el ${d}` });
    }
  }

  for (const s of staff) {
    dates.forEach((d, i) => {
      const code = schedule[s.id]?.[d];
      if (!code) return;
      if (!ALLOWED[s.role].includes(code))
        issues.push({ kind: "forbidden", date: d, staffId: s.id, message: `${s.name} no puede hacer ${code}` });
      if (i > 0 && s.role === "receptionist") {
        const prev = schedule[s.id][dates[i - 1]];
        if ((prev === "T" && code === "M") || (prev === "N" && code !== "D"))
          issues.push({ kind: "rest", date: d, staffId: s.id, message: `${s.name}: descanso insuficiente el ${d}` });
      }
    });
  }
  return { coverage, issues };
}
