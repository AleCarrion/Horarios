"use client";

import { useEffect, useRef } from "react";
import type { Level, Plan } from "@/lib/domain/repair";
import { SHIFTS, displayCode, type Staff } from "@/lib/domain/types";
import { SHIFT_STYLE } from "@/lib/ui";
import { AlertIcon, CheckIcon } from "./icons";

const LEVEL: Record<Level, { title: string; tone: string }> = {
  green: { title: "Se puede cuadrar sin problemas", tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  amber: { title: "Se puede, pero hay que forzar algo", tone: "bg-amber-400/25 text-amber-800 dark:text-amber-200" },
  red: { title: "No cuadra con las reglas actuales", tone: "bg-red-500/15 text-red-700 dark:text-red-300" },
};

interface Props {
  plan: Plan;
  title: string;
  staff: Staff[];
  onApply: () => void;
  onCancel: () => void;
}

export function PlanDialog({ plan, title, staff, onApply, onCancel }: Props) {
  const apply = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    apply.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onCancel]);

  const byPerson = new Map<string, typeof plan.changes>();
  for (const c of plan.changes) byPerson.set(c.staffId, [...(byPerson.get(c.staffId) ?? []), c]);
  const name = (id: string) => staff.find((s) => s.id === id)?.name ?? id;
  const { title: levelTitle, tone } = LEVEL[plan.level];

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-slate-950/50 p-3 backdrop-blur-sm sm:place-items-center print:hidden" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-title"
        onClick={(e) => e.stopPropagation()}
        className="anim-menu glass max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-card-solid p-5 shadow-2xl"
      >
        <h2 id="plan-title" className="text-lg font-bold">{title}</h2>
        <p className={`mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${tone}`}>
          {plan.level === "green" ? <CheckIcon width={18} height={18} /> : <AlertIcon width={18} height={18} />}
          <span>
            {levelTitle}
            {plan.reason && <span className="mt-0.5 block font-normal">{plan.reason}</span>}
          </span>
        </p>

        {plan.changes.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No hay que cambiar ninguna casilla.</p>
        ) : (
          <>
            <p className="mt-3 text-sm text-muted">
              {plan.changes.length} casilla{plan.changes.length === 1 ? "" : "s"} · {byPerson.size} persona{byPerson.size === 1 ? "" : "s"}
              {plan.strategy === "swap" && " · se intercambian días de trabajo y de descanso"}
            </p>
            <ul className="mt-2 space-y-2">
              {[...byPerson].map(([id, list]) => (
                <li key={id} className="rounded-xl border border-line p-2.5">
                  <div className="text-sm font-semibold">{name(id)}</div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {list.map((c) => (
                      <span key={c.date} className="inline-flex items-center gap-1 rounded-lg bg-brand/5 px-1.5 py-1 text-xs">
                        <span className="font-semibold">{Number(c.date.slice(8))}</span>
                        <span className={`grid h-5 w-5 place-items-center rounded text-[10px] font-bold opacity-70 ${c.from ? SHIFT_STYLE[c.from] : ""}`} title={c.from ? SHIFTS[c.from].label : ""}>
                          {c.from ? displayCode(c.from) : "·"}
                        </span>
                        →
                        <span className={`grid h-5 w-5 place-items-center rounded text-[10px] font-bold ${SHIFT_STYLE[c.to]}`} title={SHIFTS[c.to].label}>
                          {displayCode(c.to)}
                        </span>
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-xl border border-line px-4 py-2 text-sm font-semibold transition hover:bg-brand/10 focus-visible:outline-2 focus-visible:outline-brand">
            Cancelar
          </button>
          <button
            ref={apply}
            onClick={onApply}
            className={`rounded-xl px-4 py-2 text-sm font-semibold text-white shadow transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
              plan.level === "red" ? "bg-red-600" : "bg-gradient-to-r from-brand to-brand-2"
            }`}
          >
            {plan.level === "red" ? "Aplicar igualmente" : "Aplicar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}
