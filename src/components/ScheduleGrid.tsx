"use client";

import { useEffect, useRef, useState } from "react";
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
  const [menu, setMenu] = useState<{ staff: Staff; date: string; x: number; y: number } | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeMenu = () => {
    setMenu(null);
    opener.current?.focus();
  };

  useEffect(() => {
    if (!menu) return;
    const current = menuRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    (current ?? menuRef.current?.querySelector<HTMLElement>("button"))?.focus();
  }, [menu]);

  const onMenuKey = (e: React.KeyboardEvent) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>("button") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") closeMenu();
    else if (e.key === "ArrowDown") items[(i + 1) % items.length]?.focus();
    else if (e.key === "ArrowUp") items[(i - 1 + items.length) % items.length]?.focus();
    else if (e.key === "Tab") closeMenu();
    else return;
    e.preventDefault();
  };

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
                    <button
                      type="button"
                      disabled={readOnly}
                      aria-haspopup="listbox"
                      aria-label={`${s.name}, ${d}, ${SHIFTS[code].label} ${code}`}
                      onClick={(e) => {
                        const r = e.currentTarget.getBoundingClientRect();
                        opener.current = e.currentTarget;
                        const h = OPTIONS[s.role].length * 36 + 8;
                        const y = r.bottom + h > window.innerHeight ? Math.max(4, r.top - h - 4) : r.bottom + 4;
                        setMenu({ staff: s, date: d, x: Math.min(r.left, window.innerWidth - 176), y });
                      }}
                      className={`flex h-9 w-10 items-center justify-center rounded text-xs font-semibold ${SHIFT_STYLE[code]} ${
                        invalid ? "ring-2 ring-red-600" : ""
                      } enabled:cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand`}
                    >
                      {code}
                    </button>
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
      {menu && (
        <>
          <div className="fixed inset-0 z-20" onClick={closeMenu} aria-hidden="true" />
          <div
            ref={menuRef}
            role="listbox"
            aria-label={`Turno de ${menu.staff.name}, ${menu.date}`}
            onKeyDown={onMenuKey}
            style={{ left: menu.x, top: menu.y }}
            className="fixed z-30 w-44 rounded-lg border border-slate-300 bg-white p-1 shadow-lg dark:bg-slate-800"
          >
            {OPTIONS[menu.staff.role].map((c) => (
              <button
                key={c}
                type="button"
                role="option"
                aria-selected={(schedule[menu.staff.id]?.[menu.date] ?? "D") === c}
                onClick={() => {
                  onEdit(menu.staff.id, menu.date, c);
                  closeMenu();
                }}
                className="flex h-9 w-full items-center gap-2 rounded px-2 text-left text-sm hover:bg-brand/10 focus-visible:bg-brand/15 focus-visible:outline-2 focus-visible:outline-brand aria-selected:font-bold"
              >
                <span className={`flex h-6 w-8 items-center justify-center rounded text-xs font-semibold ${SHIFT_STYLE[c]}`}>
                  {c}
                </span>
                {SHIFTS[c].label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
