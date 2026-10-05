"use client";

import { monthDates, weekday, isWeekend } from "@/lib/domain/dates";
import { SHIFTS, type Schedule, type ShiftCode, type Staff } from "@/lib/domain/types";
import type { Validation } from "@/lib/domain/validate";
import { SHIFT_STYLE, WEEKDAYS } from "@/lib/ui";

const OPTIONS: Record<Staff["role"], ShiftCode[]> = {
  night_auditor: ["N", "D"],
  director: ["S", "D"],
  senior: ["P", "M", "D"],
  receptionist: ["M", "T", "N", "D"],
  mozo: ["MZ", "D"],
};

interface Props {
  year: number;
  month: number;
  staff: Staff[];
  schedule: Schedule;
  validation: Validation;
  onEdit: (staffId: string, date: string, code: ShiftCode) => void;
  readOnly?: boolean;
}

export function ScheduleGrid({ year, month, staff, schedule, validation, onEdit, readOnly }: Props) {
  const dates = monthDates(year, month);
  const bad = new Set(validation.issues.filter((i) => i.staffId).map((i) => `${i.staffId}|${i.date}`));

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-300/60 bg-white shadow-sm dark:bg-slate-900">
      <table className="border-separate border-spacing-0 text-sm">
        <caption className="sr-only">Horario mensual por persona y día</caption>
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-10 min-w-32 bg-white p-2 text-left dark:bg-slate-900">
              Persona
            </th>
            {dates.map((d) => (
              <th
                key={d}
                scope="col"
                className={`min-w-11 p-1 text-center font-medium ${isWeekend(d) ? "text-accent" : ""}`}
              >
                <div className="text-[11px] opacity-70">{WEEKDAYS[weekday(d)]}</div>
                <div>{Number(d.slice(8))}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {staff.map((s) => (
            <tr key={s.id}>
              <th scope="row" className="sticky left-0 z-10 bg-white p-2 text-left font-medium dark:bg-slate-900">
                {s.name}
              </th>
              {dates.map((d) => {
                const code = schedule[s.id]?.[d] ?? "D";
                const invalid = bad.has(`${s.id}|${d}`);
                return (
                  <td key={d} className="p-0.5">
                    <div
                      className={`relative flex h-9 w-10 items-center justify-center rounded text-xs font-semibold ${SHIFT_STYLE[code]} ${
                        invalid ? "ring-2 ring-red-600" : ""
                      } focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-brand`}
                    >
                      <span aria-hidden="true">{code === "D" ? "–" : code}</span>
                      <select
                        aria-label={`${s.name}, ${d}`}
                        value={code}
                        disabled={readOnly}
                        onChange={(e) => onEdit(s.id, d, e.target.value as ShiftCode)}
                        className="absolute inset-0 cursor-pointer opacity-0"
                      >
                        {OPTIONS[s.role].map((c) => (
                          <option key={c} value={c}>
                            {c === "D" ? "–" : c} · {SHIFTS[c].label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          {(["M", "T", "N"] as const).map((k) => (
            <tr key={k}>
              <th scope="row" className="sticky left-0 z-10 bg-white p-2 text-left text-xs dark:bg-slate-900">
                Cobertura {SHIFTS[k].label}
              </th>
              {dates.map((d) => {
                const ok = validation.coverage[d]?.[k] === 1;
                return (
                  <td
                    key={d}
                    className={`p-1 text-center text-xs font-bold ${ok ? "text-emerald-700" : "bg-red-100 text-red-800"}`}
                  >
                    <span aria-label={ok ? "cubierto" : "sin cubrir"}>{ok ? "✓" : "✗"}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tfoot>
      </table>
    </div>
  );
}
