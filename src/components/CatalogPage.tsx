"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useCatalog } from "@/lib/catalogStore";
import { BUILTIN_SHIFTS, DEFAULT_CATALOG, nextPositionId, nextShiftCode, normalizeCatalog, shiftPaint, textOn, type Catalog, type CustomShift, type PositionDef, type ShiftSetting } from "@/lib/domain/catalog";
import type { BuiltinShift, Role } from "@/lib/domain/types";
import { remoteConfigured } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";
import { useRemoteCatalog } from "@/lib/useRemoteCatalog";
import { readRequests } from "@/lib/requestsStore";

import { ConfirmDialog } from "./ConfirmDialog";
import { ArrowDown, ArrowUp, PaletteIcon, PlusIcon, TrashIcon } from "./icons";
import { MobileTabBar } from "./MobileTabBar";
import { PageHeader } from "./PageHeader";

const field =
  "min-w-0 rounded-lg border border-line bg-card-solid px-2.5 py-2 text-sm transition hover:border-brand/50 focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-40";
const BASE_LABEL: Record<Role, string> = {
  director: "Dirección",
  senior: "Apoyo / Partido",
  receptionist: "Recepción",
  night_auditor: "Noche",
  mozo: "Mozos",
};
const BASE_HINT: Record<Role, string> = {
  director: "Supervisión de lunes a viernes; libra fines de semana y festivos.",
  senior: "Partido y, si se les da permiso, mañanas o tardes.",
  receptionist: "Rotan mañana, tarde y noche en bloques de varios días.",
  night_auditor: "Siempre de noche; cuando libra, cubre recepción.",
  mozo: "Ciclos de 5 días de trabajo y 5 de descanso.",
};
const ROW =
  "flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-card-solid/70 p-3 sm:grid sm:grid-cols-[2.75rem_minmax(0,1fr)_4rem_3rem_16rem]";
/** Shifts with hours (the rest are days without work). */
const TIMED: BuiltinShift[] = ["M", "T", "N", "S", "P", "MZ"];

function ColorField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <input
      type="color"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-line bg-card-solid p-1"
    />
  );
}

function Chip({ code, letter }: { code: string; letter: string }) {
  return (
    <span style={shiftPaint(code)} className="grid h-9 w-11 shrink-0 place-items-center rounded-lg text-sm font-bold shadow-[inset_0_-2px_0_rgba(0,0,0,0.14)]" aria-hidden="true">
      {letter}
    </span>
  );
}

/** Names, letters, hours and colours of the shifts, the hotel's own shifts and puestos. Saved on the spot and shared between devices. */
export function CatalogPage() {
  const auth = useAuth();
  const readOnly = remoteConfigured && !auth.isEditor;
  const catalog = useCatalog();
  const remote = useRemoteCatalog(auth, { listen: false });
  const [draft, setDraft] = useState<Catalog>(catalog);
  const [status, setStatus] = useState<"" | "saving" | "saved" | string>("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [pending, setPending] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const edited = useRef(false);

  useEffect(() => {
    setPending(readRequests().filter((r) => r.status === "pending").length); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);
  // what arrives from the server (or the device at start) replaces the draft until the person starts typing
  useEffect(() => {
    if (!edited.current) setDraft(catalog);
  }, [catalog]);

  const change = (next: Catalog) => {
    if (readOnly) return;
    edited.current = true;
    setDraft(next);
    setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void remote.save(normalizeCatalog(next)).then((err) => setStatus(err ? `No se ha podido enviar al servidor: ${err}. Se reintenta al volver a abrir la app.` : "saved"));
    }, 500);
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const setShift = (code: BuiltinShift, patch: Partial<ShiftSetting>) => change({ ...draft, shifts: { ...draft.shifts, [code]: { ...draft.shifts[code], ...patch } } });
  const setCustom = (code: string, patch: Partial<CustomShift>) => change({ ...draft, custom: draft.custom.map((c) => (c.code === code ? { ...c, ...patch } : c)) });
  const addShift = () =>
    change({ ...draft, custom: [...draft.custom, { code: nextShiftCode(draft), label: "Nuevo turno", letter: "X", start: "", end: "", color: "#e879f9", counts: "work" }] });
  const setPosition = (id: string, patch: Partial<PositionDef>) => change({ ...draft, positions: draft.positions.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  const addPosition = () =>
    change({ ...draft, positions: [...draft.positions, { id: nextPositionId(draft), label: "Nuevo puesto", color: "#ec4899", base: "receptionist", custom: true }] });
  const removePosition = (id: string) => change({ ...draft, positions: draft.positions.filter((p) => p.id !== id) });
  const movePosition = (id: string, dir: -1 | 1) => {
    const i = draft.positions.findIndex((p) => p.id === id);
    const j = i + dir;
    if (j < 0 || j >= draft.positions.length) return;
    const next = [...draft.positions];
    [next[i], next[j]] = [next[j], next[i]];
    change({ ...draft, positions: next });
  };

  const dirty = JSON.stringify(normalizeCatalog(draft)) !== JSON.stringify(DEFAULT_CATALOG);

  return (
    <>
      <PageHeader auth={auth} status={readOnly ? "readonly" : "synced"} />

      <main className="mx-auto w-full min-w-0 max-w-[1500px] p-4">
        {/* left edge in line with the header */}
        <div className="max-w-[820px] space-y-6">
        <div className="anim-fade-up">
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl"><PaletteIcon width={22} height={22} /> Turnos y puestos</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Cómo se llama cada turno, qué letra y color lleva y qué horas tiene, y los puestos de tu equipo. Se guarda al momento y lo ven todos los dispositivos.
            Las reglas de descanso y de cobertura siguen en <Link href="/reglas" className="font-semibold text-brand underline-offset-2 hover:underline">Reglas</Link>.
          </p>
        </div>

        <fieldset disabled={readOnly} className="min-w-0 space-y-10">
          <section aria-label="Turnos" className="space-y-3">
            <h3 className="text-lg font-bold">Turnos</h3>
            <p className="text-sm text-muted">El motor sigue usando los de siempre (mañana, tarde, noche…): aquí cambias cómo se ven y se llaman.</p>
            <ul className="space-y-2">
              {BUILTIN_SHIFTS.map((code) => {
                const s = draft.shifts[code];
                const timed = TIMED.includes(code);
                return (
                  <li key={code} className={ROW}>
                    <Chip code={code} letter={s.letter} />
                    <input aria-label={`Nombre del turno ${DEFAULT_CATALOG.shifts[code].label}`} value={s.label} maxLength={30} onChange={(e) => setShift(code, { label: e.target.value })} className={`${field} min-w-[8rem] flex-1`} />
                    {code !== "B" ? (
                      <input aria-label={`Letra del turno ${DEFAULT_CATALOG.shifts[code].label}`} value={s.letter} maxLength={3} onChange={(e) => setShift(code, { letter: e.target.value })} className={`${field} w-16 text-center font-bold uppercase`} />
                    ) : (
                      <span className="max-sm:hidden" />
                    )}
                    <ColorField label={`Color del turno ${DEFAULT_CATALOG.shifts[code].label}`} value={s.color} onChange={(v) => setShift(code, { color: v })} />
                    {timed ? (
                      <span className="flex items-center gap-1.5 text-sm max-sm:w-full">
                        <input type="time" aria-label={`Entrada del turno ${DEFAULT_CATALOG.shifts[code].label}`} value={s.start} onChange={(e) => setShift(code, { start: e.target.value })} className={field} />
                        –
                        <input type="time" aria-label={`Salida del turno ${DEFAULT_CATALOG.shifts[code].label}`} value={s.end} onChange={(e) => setShift(code, { end: e.target.value })} className={field} />
                      </span>
                    ) : (
                      <span className="text-xs text-muted max-sm:hidden">Sin horario: no es un turno de trabajo</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-label="Turnos propios" className="space-y-3">
            <h3 className="text-lg font-bold">Turnos propios del hotel</h3>
            <p className="text-sm text-muted">
              Por ejemplo «Desayunos 10:00–14:00» o «Curso». Los eliges a mano en cada casilla; el generador y «Arreglar avisos» no los mueven.
              «Trabajo» cuenta como día trabajado y suma horas; «Sin trabajo» cuenta como libre.
            </p>
            <ul className="space-y-2">
              {draft.custom.length === 0 && <li className="text-sm text-muted">Todavía no has creado ninguno.</li>}
              {draft.custom.map((c) => (
                <li key={c.code} className={`${ROW} ${c.archived ? "opacity-60" : ""}`}>
                  <span style={{ backgroundColor: c.color, color: textOn(c.color) }} className="grid h-9 w-11 shrink-0 place-items-center rounded-lg text-sm font-bold" aria-hidden="true">{c.letter.toUpperCase()}</span>
                  <input aria-label={`Nombre del turno ${c.code}`} value={c.label} maxLength={30} onChange={(e) => setCustom(c.code, { label: e.target.value })} className={`${field} min-w-[8rem] flex-1`} />
                  <input aria-label={`Letra del turno ${c.label}`} value={c.letter} maxLength={3} onChange={(e) => setCustom(c.code, { letter: e.target.value })} className={`${field} w-16 text-center font-bold uppercase`} />
                  <ColorField label={`Color del turno ${c.label}`} value={c.color} onChange={(v) => setCustom(c.code, { color: v })} />
                  <span className="flex items-center gap-1.5 text-sm max-sm:w-full">
                    <input type="time" aria-label={`Entrada del turno ${c.label}`} value={c.start} onChange={(e) => setCustom(c.code, { start: e.target.value })} className={field} />
                    –
                    <input type="time" aria-label={`Salida del turno ${c.label}`} value={c.end} onChange={(e) => setCustom(c.code, { end: e.target.value })} className={field} />
                  </span>
                  <div className="flex w-full flex-wrap items-center gap-2 sm:col-span-full sm:col-start-2">
                    <label className="flex items-center gap-1.5 text-sm">
                      <span className="text-muted">Cuenta como</span>
                      <select aria-label={`Cuenta como, turno ${c.label}`} value={c.counts} onChange={(e) => setCustom(c.code, { counts: e.target.value as "work" | "off" })} className={field}>
                        <option value="work">Trabajo</option>
                        <option value="off">Sin trabajo</option>
                      </select>
                    </label>
                    <button type="button" onClick={() => setCustom(c.code, { archived: !c.archived })} className="ml-auto rounded-lg border border-line px-3 py-2 text-xs font-semibold transition hover:bg-brand/10">
                      {c.archived ? "Volver a usar" : "Dejar de usar"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <button type="button" onClick={addShift} className="inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-brand-solid to-brand-2-solid px-4 font-semibold text-white shadow transition active:scale-95">
              <PlusIcon width={16} height={16} /> Añadir turno
            </button>
            <p className="text-xs text-muted">«Dejar de usar» lo quita del menú de las casillas, pero los días que ya lo tienen lo conservan.</p>
          </section>

          <section aria-label="Puestos" className="space-y-3">
            <h3 className="text-lg font-bold">Puestos</h3>
            <p className="text-sm text-muted">
              Los nombres y colores de las secciones del equipo. Un puesto nuevo se planifica «como» uno de los de siempre (descansos, turnos que puede hacer…). Ejemplo: «Conserjes» como Recepción.
            </p>
            <ul className="space-y-2">
              {draft.positions.map((p, i) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-card-solid/70 p-3 sm:grid sm:grid-cols-[0.5rem_minmax(0,16rem)_3rem_minmax(0,1fr)_auto]">
                  <span style={{ backgroundColor: p.color }} className="h-9 w-2 shrink-0 rounded-full" aria-hidden="true" />
                  <input aria-label={`Nombre del puesto ${p.custom ? p.id : BASE_LABEL[p.base]}`} value={p.label} maxLength={30} onChange={(e) => setPosition(p.id, { label: e.target.value })} className={`${field} min-w-[8rem] flex-1`} />
                  <ColorField label={`Color del puesto ${p.label}`} value={p.color} onChange={(v) => setPosition(p.id, { color: v })} />
                  {p.custom ? (
                    <label className="flex items-center gap-1.5 text-sm">
                      <span className="text-muted">Como</span>
                      <select aria-label={`Se planifica como, puesto ${p.label}`} value={p.base} onChange={(e) => setPosition(p.id, { base: e.target.value as Role })} className={field}>
                        {(Object.keys(BASE_LABEL) as Role[]).map((r) => (
                          <option key={r} value={r}>{BASE_LABEL[r]}</option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <span className="text-xs text-muted max-sm:w-full">{BASE_HINT[p.base]}</span>
                  )}
                  <span className="ml-auto flex items-center gap-1">
                    <button type="button" disabled={i === 0} onClick={() => movePosition(p.id, -1)} aria-label={`Subir el puesto ${p.label}`} className="grid h-9 w-9 place-items-center rounded-lg text-muted transition hover:bg-brand/10 disabled:opacity-30"><ArrowUp width={16} height={16} /></button>
                    <button type="button" disabled={i === draft.positions.length - 1} onClick={() => movePosition(p.id, 1)} aria-label={`Bajar el puesto ${p.label}`} className="grid h-9 w-9 place-items-center rounded-lg text-muted transition hover:bg-brand/10 disabled:opacity-30"><ArrowDown width={16} height={16} /></button>
                    {p.custom && (
                      <button type="button" onClick={() => removePosition(p.id)} aria-label={`Quitar el puesto ${p.label}`} className="grid h-9 w-9 place-items-center rounded-lg text-red-600 transition hover:bg-red-500/10"><TrashIcon width={16} height={16} /></button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <button type="button" onClick={addPosition} className="inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-brand-solid to-brand-2-solid px-4 font-semibold text-white shadow transition active:scale-95">
              <PlusIcon width={16} height={16} /> Añadir puesto
            </button>
            <p className="text-xs text-muted">Después, en <Link href="/equipo" className="font-semibold text-brand underline-offset-2 hover:underline">Equipo</Link>, cambia a cada persona al puesto nuevo. Si quitas un puesto, su gente vuelve al puesto de siempre en el que se planificaba.</p>
          </section>
        </fieldset>

        <div className="flex items-center justify-between gap-3">
          <p role="status" className={`text-sm font-semibold ${status === "saved" || status === "saving" ? "text-emerald-600" : "text-red-600"}`}>
            {status === "saved" ? "Guardado" : status === "saving" ? "Guardando…" : status}
          </p>
          <button type="button" disabled={!dirty || readOnly} onClick={() => setConfirmReset(true)} className="rounded-xl border border-line px-4 py-2 text-sm font-semibold transition hover:bg-brand/10 disabled:opacity-40">
            Volver a los valores de siempre
          </button>
        </div>
        </div>
      </main>
      {confirmReset && (
        <ConfirmDialog title="¿Volver a los valores de siempre?" confirmLabel="Volver" onCancel={() => setConfirmReset(false)} onConfirm={() => { setConfirmReset(false); change({ ...DEFAULT_CATALOG, custom: draft.custom.map((c) => ({ ...c, archived: true })) }); }}>
          Los turnos y puestos recuperan sus nombres, letras, horas y colores originales. Los turnos propios dejan de usarse (los días que los tengan se conservan).
        </ConfirmDialog>
      )}
      <MobileTabBar pending={pending} />
    </>
  );
}
