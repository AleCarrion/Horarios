"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createRequests, dayLabel, KIND_LABEL, validateNew, type NewRequest, type RequestKind, type ShiftRequest } from "@/lib/domain/requests";
import type { Staff } from "@/lib/domain/types";
import { diffDays } from "@/lib/domain/dates";
import { CloseIcon, PlusIcon } from "./icons";

interface Props {
  open: boolean;
  onClose: () => void;
  /** The person this worker is. */
  me: Staff | undefined;
  staff: Staff[];
  requests: ShiftRequest[];
  today: string | null;
  onCreate: (rs: ShiftRequest[]) => void;
  onCancel: (id: string) => void;
}

const STATUS: Record<ShiftRequest["status"], { label: string; tone: string }> = {
  pending: { label: "Pendiente", tone: "bg-amber-400/25 text-amber-900 dark:text-amber-200" },
  approved: { label: "Aprobada", tone: "bg-emerald-500/20 text-emerald-800 dark:text-emerald-200" },
  rejected: { label: "Rechazada", tone: "bg-red-500/15 text-red-700 dark:text-red-300" },
};
const SHIFT_NAME = { M: "mañanas", T: "tardes", N: "noches" } as const;
const input = "w-full rounded-lg border border-line bg-card-solid/60 px-2 py-2 text-base sm:text-sm";

/** What a worker sees: her own requests, with their state, and a form to send a new one. */
export function MyRequestsPanel({ open, onClose, me, staff, requests, today, onCreate, onCancel }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<NewRequest>>({ kind: "libre" });
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open, onClose]);

  const mine = useMemo(() => requests.filter((r) => r.staffId === me?.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [requests, me]);
  if (!open) return null;

  const name = (id?: string) => staff.find((s) => s.id === id)?.name ?? "?";
  const ahead = today && form.date ? diffDays(form.date, today) : null;
  const short = ahead !== null && ahead >= 0 && ahead < 30;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!me) return;
    const draft = { ...form, staffId: me.id };
    const problem = validateNew(draft, staff);
    if (problem) return setError(problem);
    if (today && form.date && form.date < today) return setError("Esa fecha ya ha pasado.");
    onCreate(createRequests(draft as NewRequest));
    setForm({ kind: form.kind });
    setError(null);
    setShowForm(false);
  };

  const describe = (r: ShiftRequest) => {
    const days = r.endDate && r.endDate !== r.date ? `${dayLabel(r.date)}–${dayLabel(r.endDate)}` : dayLabel(r.date);
    if (r.kind === "cambio") return `con ${name(r.withStaffId)} · ${days}${r.returnDate ? ` (devuelve el ${dayLabel(r.returnDate)})` : ""}`;
    if (r.kind === "turno" && r.shift) return `${SHIFT_NAME[r.shift]} · ${days}`;
    return days;
  };

  return (
    <div className="fixed inset-0 z-50 print:hidden" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]" />
      <aside role="dialog" aria-modal="true" aria-label="Mis peticiones" onClick={(e) => e.stopPropagation()} className="anim-slide absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-card-solid shadow-2xl">
        <header className="flex items-center justify-between border-b border-line px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
          <div>
            <h2 className="text-lg font-bold">Mis peticiones</h2>
            <p className="text-xs text-muted">{me ? `Como ${me.name}` : "Tu cuenta aún no está vinculada a una persona del equipo"}</p>
          </div>
          <button ref={closeRef} onClick={onClose} aria-label="Cerrar" className="grid h-10 w-10 place-items-center rounded-xl transition hover:bg-brand/10">
            <CloseIcon />
          </button>
        </header>

        <div className="px-4 pt-3">
          <button
            onClick={() => setShowForm((v) => !v)}
            disabled={!me}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand to-brand-2 px-4 py-2.5 font-semibold text-white shadow transition active:scale-[0.99] disabled:opacity-40"
          >
            <PlusIcon width={16} height={16} /> Nueva petición
          </button>
        </div>

        {showForm && (
          <form onSubmit={submit} className="anim-fade-up mx-4 mt-3 space-y-2 rounded-2xl border border-line p-3 text-sm">
            <label className="block">
              <span className="text-xs text-muted">¿Qué quieres pedir?</span>
              <select value={form.kind} onChange={(e) => setForm({ kind: e.target.value as RequestKind })} className={input}>
                <option value="libre">Un día libre</option>
                <option value="vacaciones">Vacaciones</option>
                <option value="turno">Hacer un turno concreto (mañanas, tardes…)</option>
                <option value="cambio">Cambiar el turno con un compañero</option>
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label>
                <span className="text-xs text-muted">{form.kind === "vacaciones" || form.kind === "turno" ? "Primer día" : "Día"}</span>
                <input type="date" value={form.date ?? ""} onChange={(e) => setForm({ ...form, date: e.target.value })} className={input} />
              </label>
              {(form.kind === "vacaciones" || form.kind === "turno") && (
                <label>
                  <span className="text-xs text-muted">Último día</span>
                  <input type="date" value={form.endDate ?? ""} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className={input} />
                </label>
              )}
              {form.kind === "turno" && (
                <label className="col-span-2">
                  <span className="text-xs text-muted">Quiero hacer</span>
                  <select value={form.shift ?? ""} onChange={(e) => setForm({ ...form, shift: (e.target.value || undefined) as NewRequest["shift"] })} className={input}>
                    <option value="">elegir…</option>
                    <option value="M">Mañanas</option>
                    <option value="T">Tardes</option>
                    <option value="N">Noches</option>
                  </select>
                </label>
              )}
              {form.kind === "cambio" && (
                <>
                  <label className="col-span-2">
                    <span className="text-xs text-muted">Con quién</span>
                    <select value={form.withStaffId ?? ""} onChange={(e) => setForm({ ...form, withStaffId: e.target.value })} className={input}>
                      <option value="">elegir…</option>
                      {staff.filter((s) => s.id !== me?.id).map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="col-span-2">
                    <span className="text-xs text-muted">Devolver el día (opcional)</span>
                    <input type="date" value={form.returnDate ?? ""} onChange={(e) => setForm({ ...form, returnDate: e.target.value })} className={input} />
                  </label>
                </>
              )}
            </div>
            {short && <p className="rounded-lg bg-amber-400/20 px-2 py-1.5 text-xs font-medium">Quedan menos de 30 días: lo ideal es pedirlo con un mes de antelación. Si es urgente, díselo también a la jefa.</p>}
            <label className="block">
              <span className="text-xs text-muted">Nota (opcional)</span>
              <input value={form.note ?? ""} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Motivo, por si ayuda" className={input} />
            </label>
            {error && <p role="alert" className="text-xs font-semibold text-red-600">{error}</p>}
            <button className="w-full rounded-xl bg-accent px-3 py-2.5 font-semibold text-white shadow transition active:scale-[0.99]">Enviar petición</button>
          </form>
        )}

        <ul className="flex-1 space-y-3 overflow-y-auto px-4 py-3" aria-label="Mis peticiones enviadas">
          {mine.length === 0 && <li className="text-sm text-muted">Todavía no has enviado ninguna petición.</li>}
          {mine.map((r) => (
            <li key={r.id} className="rounded-2xl border border-line p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">{KIND_LABEL[r.kind]}</p>
                  <p className="font-semibold">{describe(r)}</p>
                  {r.note && <p className="text-xs text-muted">«{r.note}»</p>}
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS[r.status].tone}`}>{STATUS[r.status].label}</span>
              </div>
              {r.decisionNote && <p className="mt-2 rounded-lg bg-brand/10 px-2 py-1.5 text-xs"><b>La jefa dice:</b> {r.decisionNote}</p>}
              {r.status === "pending" && (
                <button onClick={() => onCancel(r.id)} className="mt-2 text-xs font-semibold text-red-600 underline-offset-2 hover:underline">Cancelar petición</button>
              )}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
