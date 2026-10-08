"use client";

import { useEffect, useState } from "react";
import { DEFAULT_RULES, isHolidayEntry, normalizeRules, type Rules } from "@/lib/domain/ruleset";
import { readRequests } from "@/lib/requestsStore";
import { readRules, writeRules } from "@/lib/rulesStore";
import { AppNav } from "./AppNav";
import { LogoMark, PlusIcon, TrashIcon } from "./icons";
import { MobileTabBar } from "./MobileTabBar";

const MONTH_NAMES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const describe = (h: string) => {
  const [y, m, d] = h.length === 5 ? [null, ...h.split("-")] : h.split("-");
  return `${Number(d)} de ${MONTH_NAMES[Number(m) - 1]}${y ? ` de ${y}` : " (todos los años)"}`;
};

function Stepper({ label, hint, value, min, max, onChange }: { label: string; hint: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-card-solid/70 p-4">
      <div className="min-w-0 flex-1 basis-56">
        <p className="font-semibold">{label}</p>
        <p className="text-sm text-muted">{hint}</p>
      </div>
      <div className="flex items-center gap-2" role="group" aria-label={label}>
        <button type="button" aria-label={`Menos: ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)} className="grid h-11 w-11 place-items-center rounded-xl border border-line text-xl font-bold transition active:scale-95 disabled:opacity-35">−</button>
        <output className="w-10 text-center text-xl font-bold tabular-nums" aria-live="polite">{value}</output>
        <button type="button" aria-label={`Más: ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)} className="grid h-11 w-11 place-items-center rounded-xl border border-line text-xl font-bold transition active:scale-95 disabled:opacity-35">+</button>
      </div>
    </div>
  );
}

/** The hotel's scheduling rules, editable by the manager. Saved on the spot; the schedule warnings follow them straight away. */
export function RulesPage() {
  const [rules, setRules] = useState<Rules>(DEFAULT_RULES);
  const [pending, setPending] = useState(0);
  const [date, setDate] = useState("");
  const [yearly, setYearly] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setRules(readRules()); // eslint-disable-line react-hooks/set-state-in-effect
    setPending(readRequests().filter((r) => r.status === "pending").length);
  }, []);

  const change = (patch: Partial<Rules>) => {
    const next = normalizeRules({ ...rules, ...patch });
    setRules(next);
    writeRules(next);
    setSaved(true);
  };
  const addHoliday = () => {
    if (!date) return;
    const entry = yearly ? date.slice(5) : date;
    if (!isHolidayEntry(entry)) return;
    change({ localHolidays: [...rules.localHolidays, entry] });
    setDate("");
  };
  const isDefault = JSON.stringify(rules) === JSON.stringify(DEFAULT_RULES);

  return (
    <>
      <header className="glass sticky top-0 z-30 border-x-0 border-t-0 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-brand to-brand-2 shadow-lg shadow-brand/30 sm:h-11 sm:w-11">
              <LogoMark />
            </span>
            <div className="leading-tight">
              <h1 className="text-lg font-bold tracking-tight">Horarios</h1>
              <p className="text-xs text-muted">Hotel Casa 1800</p>
            </div>
          </div>
          <div className="max-sm:hidden"><AppNav /></div>
        </div>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-[820px] space-y-5 p-4">
        <div className="anim-fade-up">
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Reglas del horario</h2>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Lo que el generador respeta y lo que avisa si no se cumple. Se guarda al momento. Los meses ya guardados no cambian solos: los avisos sí se recalculan, y puedes usar «Arreglar avisos» o «Generar automático».
          </p>
        </div>

        <section aria-label="Descansos y rachas" className="space-y-3">
          <Stepper label="Máximo de días libres seguidos" hint="Más de esto sale como aviso (los mozos y las vacaciones no cuentan)." value={rules.maxRestRun} min={1} max={7} onChange={(n) => change({ maxRestRun: n })} />
          <Stepper label="Máximo de días trabajados seguidos" hint="Por encima de esto, aviso. El generador solo llega aquí si no puede cubrir un turno de otra forma." value={rules.maxWorkRun} min={3} max={10} onChange={(n) => change({ maxWorkRun: n })} />
          <Stepper label="Días seguidos que intenta no pasar" hint="Lo normal del generador (no puede ser más que el máximo)." value={rules.preferredWorkRun} min={2} max={rules.maxWorkRun} onChange={(n) => change({ preferredWorkRun: n })} />
          <label className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-card-solid/70 p-4">
            <span className="min-w-0">
              <span className="block font-semibold">Solo una persona de partido al día</span>
              <span className="block text-sm text-muted">Si trabajan los dos de apoyo, uno cubre una mañana o una tarde.</span>
            </span>
            <input type="checkbox" role="switch" checked={rules.onePartido} onChange={(e) => change({ onePartido: e.target.checked })} className="h-6 w-11 shrink-0 accent-[var(--brand)]" />
          </label>
        </section>

        <section aria-label="Festivos locales" className="space-y-3 rounded-2xl border border-line bg-card-solid/70 p-4">
          <div>
            <h3 className="font-semibold">Festivos locales</h3>
            <p className="text-sm text-muted">Los nacionales ya están. La dirección libra también estos días y salen marcados en el cuadrante.</p>
          </div>
          <ul className="space-y-2">
            {rules.localHolidays.length === 0 && <li className="text-sm text-muted">Todavía no hay ninguno.</li>}
            {rules.localHolidays.map((h) => (
              <li key={h} className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2">
                <span>{describe(h)}</span>
                <button type="button" aria-label={`Quitar el festivo ${describe(h)}`} onClick={() => change({ localHolidays: rules.localHolidays.filter((x) => x !== h) })} className="grid h-9 w-9 place-items-center rounded-lg text-red-600 transition hover:bg-red-500/10 active:scale-95">
                  <TrashIcon width={16} height={16} />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-0 flex-1 basis-40">
              <span className="text-xs text-muted">Día</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-0.5 w-full rounded-xl border border-line bg-card-solid px-3 py-2" />
            </label>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input type="checkbox" checked={yearly} onChange={(e) => setYearly(e.target.checked)} /> Se repite cada año
            </label>
            <button type="button" onClick={addHoliday} disabled={!date} className="inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-brand to-brand-2 px-4 font-semibold text-white shadow transition active:scale-95 disabled:opacity-40">
              <PlusIcon width={16} height={16} /> Añadir
            </button>
          </div>
        </section>

        <div className="flex items-center justify-between gap-3">
          <p role="status" className="text-sm font-semibold text-emerald-600">{saved ? "Guardado" : ""}</p>
          <button type="button" disabled={isDefault} onClick={() => change(DEFAULT_RULES)} className="rounded-xl border border-line px-4 py-2 text-sm font-semibold transition hover:bg-brand/10 disabled:opacity-40">
            Volver a las reglas del hotel
          </button>
        </div>
      </main>
      <MobileTabBar pending={pending} />
    </>
  );
}
