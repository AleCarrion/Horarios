"use client";

import { useMemo } from "react";
import { summarizeMonth } from "@/lib/domain/summary";
import type { Schedule, Staff } from "@/lib/domain/types";

interface Props {
  schedule: Schedule;
  staff: Staff[];
  year: number;
  month: number;
}

const COLS: { key: "M" | "T" | "N" | "other" | "libres" | "vacaciones" | "ausencias" | "weekends" | "holidays" | "hours"; label: string; title: string }[] = [
  { key: "M", label: "M", title: "Mañanas" },
  { key: "T", label: "T", title: "Tardes" },
  { key: "N", label: "N", title: "Noches" },
  { key: "other", label: "S/P", title: "Supervisión, partido y mozo" },
  { key: "libres", label: "Libres", title: "Días libres" },
  { key: "vacaciones", label: "Vac.", title: "Días de vacaciones" },
  { key: "ausencias", label: "Aus.", title: "Días de ausencia o baja" },
  { key: "weekends", label: "Finde", title: "Sábados y domingos trabajados" },
  { key: "holidays", label: "Fest.", title: "Festivos trabajados" },
  { key: "hours", label: "Horas", title: "Horas trabajadas en el mes" },
];

/** Who has done what this month, to see at a glance that nights, weekends and holidays are shared fairly. */
export function MonthSummary({ schedule, staff, year, month }: Props) {
  const rows = useMemo(() => summarizeMonth(schedule, staff, year, month), [schedule, staff, year, month]);
  const byRole = (id: string) => staff.find((s) => s.id === id)?.role;
  // the highest value among people of the same role is highlighted (only when it is above the lowest, i.e. there is something to compare)
  const extremes = useMemo(() => {
    const out: Record<string, { max: number; min: number }> = {};
    for (const c of COLS)
      for (const role of new Set(rows.map((r) => byRole(r.staffId)))) {
        const vals = rows.filter((r) => byRole(r.staffId) === role).map((r) => r[c.key]);
        out[`${c.key}|${role}`] = { max: Math.max(...vals), min: Math.min(...vals) };
      }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, staff]);

  return (
    <details className="glass rounded-2xl p-4 text-sm print:hidden">
      <summary className="cursor-pointer select-none font-semibold">Resumen del mes por persona</summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[34rem] border-separate border-spacing-0 text-center">
          <caption className="sr-only">Turnos, libres, fines de semana, festivos y horas de cada persona</caption>
          <thead>
            <tr className="text-xs uppercase tracking-wider text-muted">
              <th scope="col" className="py-1.5 pr-3 text-left">Persona</th>
              {COLS.map((c) => (
                <th key={c.key} scope="col" title={c.title} className="px-2 py-1.5">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const person = staff.find((s) => s.id === r.staffId)!;
              return (
                <tr key={r.staffId} className="border-t border-line">
                  <th scope="row" className="whitespace-nowrap border-t border-line py-1.5 pr-3 text-left font-semibold">{person.name}</th>
                  {COLS.map((c) => {
                    const e = extremes[`${c.key}|${person.role}`];
                    const hot = e && e.max > e.min && r[c.key] === e.max && ["M", "T", "N", "weekends", "holidays", "hours"].includes(c.key);
                    return (
                      <td key={c.key} className={`border-t border-line px-2 py-1.5 tabular-nums ${hot ? "font-bold text-brand" : ""} ${r[c.key] === 0 ? "text-muted" : ""}`}>
                        {r[c.key] === 0 ? "–" : r[c.key]}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">En azul, quien más lleva de su mismo puesto (turnos, fines de semana, festivos u horas).</p>
    </details>
  );
}
