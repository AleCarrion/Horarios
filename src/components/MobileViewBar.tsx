"use client";

import { ChevronLeft, ChevronRight } from "./icons";

type Props = {
  view: "week" | "month";
  onView: (v: "week" | "month") => void;
  weekIdx: number;
  weekCount: number;
  weekLabel: string;
  onWeek: (delta: number) => void;
};

/** Selector Semana/Mes y navegación de semanas (solo móvil). */
export function MobileViewBar({ view, onView, weekIdx, weekCount, weekLabel, onWeek }: Props) {
  return (
    <div className="flex items-center gap-2 sm:hidden print:hidden">
      <div role="group" aria-label="Vista del horario" className="flex rounded-2xl border border-line bg-card-solid/70 p-0.5 text-sm font-semibold">
        {(["week", "month"] as const).map((v) => (
          <button
            key={v}
            aria-pressed={view === v}
            onClick={() => onView(v)}
            className={`min-h-9 rounded-xl px-3.5 transition ${view === v ? "bg-brand-solid text-white shadow" : "text-muted"}`}
          >
            {v === "week" ? "Semana" : "Mes"}
          </button>
        ))}
      </div>
      {view === "week" && (
        <div className="ml-auto flex items-center gap-1 rounded-2xl border border-line bg-card-solid/70 p-0.5">
          <button className="grid h-9 w-9 place-items-center rounded-xl active:bg-brand/10 disabled:opacity-30" onClick={() => onWeek(-1)} disabled={weekIdx === 0} aria-label="Semana anterior">
            <ChevronLeft width={18} height={18} />
          </button>
          <span className="min-w-20 text-center text-sm font-bold" aria-live="polite">{weekLabel}</span>
          <button className="grid h-9 w-9 place-items-center rounded-xl active:bg-brand/10 disabled:opacity-30" onClick={() => onWeek(1)} disabled={weekIdx >= weekCount - 1} aria-label="Semana siguiente">
            <ChevronRight width={18} height={18} />
          </button>
        </div>
      )}
    </div>
  );
}
