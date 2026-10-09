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
  /** Heading of the first plan when several months are shown (e.g. "Octubre"). */
  label?: string;
  /** More months affected by the same change. */
  others?: { label: string; plan: Plan }[];
  title: string;
  staff: Staff[];
  onApply: () => void;
  onCancel: () => void;
  /** The manager accepts "release these locked cells": the caller releases them and plans again. */
  onUnlock?: (cells: { staffId: string; date: string }[]) => void;
}

export function PlanDialog({ plan, label, others = [], title, staff, onApply, onCancel, onUnlock }: Props) {
  const apply = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    apply.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onCancel]);

  const sections = [{ label, plan }, ...others];
  const name = (id: string) => staff.find((s) => s.id === id)?.name ?? id;
  const worst: Level = sections.some((x) => x.plan.level === "red") ? "red" : sections.some((x) => x.plan.level === "amber") ? "amber" : "green";
  const { title: levelTitle, tone } = LEVEL[worst];
  const reasons = sections.filter((x) => x.plan.reason).map((x) => (x.label ? `${x.label}: ${x.plan.reason}` : x.plan.reason));
  const callList = [
    ...new Set(
      sections
        .filter((x) => x.plan.urgent)
        .flatMap((x) => [...x.plan.changes].sort((a, b) => a.date.localeCompare(b.date)).map((c) => c.staffId))
        .filter((id) => !sections.some((x) => x.plan.pins.some((p) => p.staffId === id)))
        .map(name),
    ),
  ];
  const tips = sections.flatMap((x) => x.plan.suggestions ?? []);
  const total = sections.reduce((n, x) => n + x.plan.changes.length, 0);

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
        {sections.some((x) => x.plan.urgent) && callList.length > 0 && (
          <p className="mt-3 rounded-xl bg-purple-500/15 px-3 py-2 text-sm font-semibold text-purple-800 dark:text-purple-200">
            Hay que avisar a: {callList.join(", ")}
            <span className="block font-normal">Son quienes cambian de turno para cubrir la ausencia (por orden de fecha).</span>
          </p>
        )}
        <p className={`mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${tone}`}>
          {worst === "green" ? <CheckIcon width={18} height={18} /> : <AlertIcon width={18} height={18} />}
          <span>
            {levelTitle}
            {reasons.map((r) => (
              <span key={r} className="mt-0.5 block font-normal">{r}</span>
            ))}
          </span>
        </p>
        {tips.length > 0 && (
          <div className="mt-3 rounded-xl border border-line bg-card-solid/60 p-3 text-sm">
            <p className="font-semibold">Cómo conseguir que cuadre</p>
            <ul className="mt-1.5 space-y-2">
              {tips.map((t) => (
                <li key={t.text} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 basis-48">{t.text}</span>
                  {t.kind === "unlock" && onUnlock && (
                    <button type="button" onClick={() => onUnlock(t.cells ?? [])} className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white shadow transition hover:brightness-110 active:scale-95">
                      Desbloquear y recalcular
                    </button>
                  )}
                  {t.kind === "rule" && (
                    <a href="/reglas" className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-brand transition hover:bg-brand/10">
                      Ver reglas
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {plan.notice && (
          <p className={`mt-2 rounded-lg px-3 py-1.5 text-xs ${plan.notice.short ? "bg-amber-400/20 text-amber-800 dark:text-amber-200" : "bg-brand/5 text-muted"}`}>
            {plan.notice.daysAhead < 0
              ? "Es un día ya pasado."
              : `Pedido con ${plan.notice.daysAhead} día${plan.notice.daysAhead === 1 ? "" : "s"} de antelación${plan.notice.short ? " (lo recomendable es un mes; en una urgencia no queda otra)" : ""}.`}
          </p>
        )}

        {total === 0 ? (
          <p className="mt-3 text-sm text-muted">No hay que cambiar ninguna casilla.</p>
        ) : (
          sections.map((sec, i) => {
            const byPerson = new Map<string, typeof sec.plan.changes>();
            for (const c of sec.plan.changes) byPerson.set(c.staffId, [...(byPerson.get(c.staffId) ?? []), c]);
            return (
              <div key={sec.label ?? i} className="mt-3">
                {sec.label && <h3 className="text-sm font-bold">{sec.label}</h3>}
                <p className="text-sm text-muted">
                  {sec.plan.changes.length === 0
                    ? "Sin cambios"
                    : `${sec.plan.changes.length} casilla${sec.plan.changes.length === 1 ? "" : "s"} · ${byPerson.size} persona${byPerson.size === 1 ? "" : "s"}`}
                  {sec.plan.strategy === "swap" && " · se intercambian días de trabajo y de descanso"}
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
                            <span className={`grid h-5 w-5 place-items-center rounded text-[10px] font-bold ${c.to === "B" ? "bg-black" : SHIFT_STYLE[c.to]}`} title={SHIFTS[c.to].label}>
                              {displayCode(c.to)}
                            </span>
                          </span>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}

        {plan.pins.length > 0 && (
          <p className="mt-3 text-xs text-muted">Al aplicar, lo pedido queda bloqueado para que un reajuste posterior no lo deshaga.</p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-xl border border-line px-4 py-2 text-sm font-semibold transition hover:bg-brand/10 focus-visible:outline-2 focus-visible:outline-brand">
            Cancelar
          </button>
          <button
            ref={apply}
            onClick={onApply}
            className={`rounded-xl px-4 py-2 text-sm font-semibold text-white shadow transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
              worst === "red" ? "bg-red-600" : "bg-gradient-to-r from-brand to-brand-2"
            }`}
          >
            {worst === "red" ? "Aplicar igualmente" : "Aplicar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}
