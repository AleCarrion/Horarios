"use client";

import { useEffect, useMemo, useState } from "react";
import { compareMonths } from "@/lib/domain/pattern";
import type { PersonSummary } from "@/lib/domain/summary";
import type { Schedule, Staff } from "@/lib/domain/types";
import { MONTHS } from "@/lib/ui";
import { CloseIcon } from "./icons";

interface Props {
  open: boolean;
  onClose: () => void;
  staff: Staff[];
  year: number;
  month: number;
  /** The month on screen. */
  schedule: Schedule;
  /** Schedule of any other month (saved, or planned on the fly). */
  load: (y: number, m: number) => Promise<Schedule | null>;
}

const METRICS: { key: keyof PersonSummary; label: string; unit?: string }[] = [
  { key: "M", label: "Mañanas" },
  { key: "T", label: "Tardes" },
  { key: "N", label: "Noches" },
  { key: "libres", label: "Libres" },
  { key: "weekends", label: "Fines de semana" },
  { key: "holidays", label: "Festivos" },
  { key: "hours", label: "Horas", unit: " h" },
];

const shift = (y: number, m: number, d: number) => {
  const t = new Date(y, m - 1 + d, 1);
  return { y: t.getFullYear(), m: t.getMonth() + 1 };
};

/** The month on screen next to another one: what each person has more or less of, to see what changed. */
export function CompareMonths({ open, onClose, staff, year, month, schedule, load }: Props) {
  const [other, setOther] = useState(() => shift(year, month, -1));
  const [otherSchedule, setOtherSchedule] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setOther(shift(year, month, -1)); // eslint-disable-line react-hooks/set-state-in-effect
  }, [open, year, month]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true); // eslint-disable-line react-hooks/set-state-in-effect
    void load(other.y, other.m).then((s) => {
      if (!alive) return;
      setOtherSchedule(s);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [open, other, load]);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open, onClose]);

  const rows = useMemo(
    () => (otherSchedule ? compareMonths(staff, { schedule: otherSchedule, year: other.y, month: other.m }, { schedule, year, month }) : []),
    [otherSchedule, staff, other, schedule, year, month],
  );
  if (!open) return null;

  const choices = [-6, -5, -4, -3, -2, -1, 1, 2].map((d) => shift(year, month, d));
  const name = (id: string) => staff.find((s) => s.id === id)?.name ?? id;
  const label = (y: number, m: number) => `${MONTHS[m - 1]} ${y}`;

  return (
    <div className="fixed inset-0 z-50 print:hidden" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Comparar meses"
        onClick={(e) => e.stopPropagation()}
        className="anim-sheet absolute inset-x-0 bottom-0 top-10 flex flex-col rounded-t-3xl bg-card-solid shadow-2xl sm:inset-x-auto sm:right-0 sm:top-0 sm:w-[44rem] sm:rounded-none"
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h2 className="text-lg font-bold">Comparar meses</h2>
            <p className="text-xs text-muted">{label(year, month)} frente a otro mes: lo que cada persona tiene de más (+) o de menos (−).</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="grid h-10 w-10 place-items-center rounded-xl transition hover:bg-brand/10 active:scale-95">
            <CloseIcon />
          </button>
        </header>

        <div className="flex flex-wrap items-center gap-2 px-4 pt-3 text-sm">
          <label htmlFor="cmp-month" className="font-semibold">Comparar con</label>
          <select
            id="cmp-month"
            value={`${other.y}-${other.m}`}
            onChange={(e) => {
              const [y, m] = e.target.value.split("-").map(Number);
              setOther({ y, m });
            }}
            className="rounded-xl border border-line bg-card-solid px-3 py-2"
          >
            {choices.map((c) => (
              <option key={`${c.y}-${c.m}`} value={`${c.y}-${c.m}`}>{label(c.y, c.m)}</option>
            ))}
          </select>
          {loading && <span className="text-xs text-muted" role="status">Calculando…</span>}
        </div>

        <div className="flex-1 overflow-auto p-4">
          {!loading && rows.length === 0 && <p className="text-sm text-muted">No hay datos de ese mes para comparar.</p>}
          {rows.length > 0 && (
            <table className="w-full min-w-[34rem] border-separate border-spacing-0 text-center text-sm">
              <caption className="sr-only">{label(other.y, other.m)} frente a {label(year, month)}, por persona</caption>
              <thead>
                <tr className="text-xs uppercase tracking-wider text-muted">
                  <th scope="col" className="sticky left-0 bg-card-solid py-1.5 pr-3 text-left">Persona</th>
                  {METRICS.map((m) => (
                    <th key={m.key} scope="col" className="px-2 py-1.5">{m.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.staffId}>
                    <th scope="row" className="sticky left-0 whitespace-nowrap border-t border-line bg-card-solid py-2 pr-3 text-left font-semibold">{name(r.staffId)}</th>
                    {METRICS.map((m) => {
                      const a = r.a[m.key] as number;
                      const b = r.b[m.key] as number;
                      const delta = b - a;
                      return (
                        <td key={m.key} className="border-t border-line px-2 py-2 tabular-nums">
                          <span className="text-muted">{a}</span> → <span className="font-semibold">{b}</span>
                          {delta !== 0 && (
                            <span className={`ml-1 rounded-full px-1.5 py-px text-[11px] font-bold ${delta > 0 ? "bg-brand/15 text-brand" : "bg-slate-500/15 text-muted"}`} aria-label={`${delta > 0 ? "más" : "menos"} ${Math.abs(delta)}`}>
                              {delta > 0 ? "+" : "−"}{Math.abs(delta)}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-3 text-xs text-muted">Cada celda: {label(other.y, other.m)} → {label(year, month)}.</p>
        </div>
      </aside>
    </div>
  );
}
