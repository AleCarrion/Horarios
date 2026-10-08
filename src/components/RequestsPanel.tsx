"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { competing, createRequests, dayLabel, KIND_LABEL, sortRequests, validateNew, type NewRequest, type RequestKind, type ShiftRequest } from "@/lib/domain/requests";
import type { Plan } from "@/lib/domain/repair";
import type { Staff } from "@/lib/domain/types";
import { AlertIcon, CheckIcon, CloseIcon, PlusIcon } from "./icons";

const LEVEL_DOT: Record<Plan["level"], string> = { green: "bg-emerald-500", amber: "bg-amber-400", red: "bg-red-500" };
const LEVEL_TEXT: Record<Plan["level"], string> = { green: "Cuadra sin problemas", amber: "Se puede, forzando algo", red: "No cuadra con las reglas" };

interface Props {
  open: boolean;
  onClose: () => void;
  requests: ShiftRequest[];
  staff: Staff[];
  /** Plans a request on the month it belongs to (null while it cannot be planned). */
  evaluate: (r: ShiftRequest) => Plan | null;
  onCreate: (rs: ShiftRequest[]) => void;
  onReview: (r: ShiftRequest, plan: Plan) => void;
  onReject: (r: ShiftRequest, note: string) => void;
  /** Change this when the schedule changes so the traffic lights are recalculated. */
  version: unknown;
  disabled?: boolean;
}

const inputCls =
  "w-full rounded-lg border border-line bg-card-solid/60 px-2 py-1.5 text-sm transition hover:border-brand/50 focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-40";

export function RequestsPanel({ open, onClose, requests, staff, evaluate, onCreate, onReview, onReject, version, disabled }: Props) {
  const [tab, setTab] = useState<"pending" | "done">("pending");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<NewRequest>>({ kind: "libre" });
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open, onClose]);

  const name = (id?: string) => staff.find((s) => s.id === id)?.name ?? id ?? "?";
  const sorted = useMemo(() => sortRequests(requests), [requests]);
  const pending = sorted.filter((r) => r.status === "pending");
  const done = sorted.filter((r) => r.status !== "pending").reverse();
  const pendingKey = pending.map((r) => r.id).join();
  const plans = useMemo(
    () => (open ? new Map(pending.map((r) => [r.id, evaluate(r)])) : new Map<string, Plan | null>()),
    // `pending` and `evaluate` change on every render; the ids and `version` say when a recalculation is really needed
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, pendingKey, version],
  );

  if (!open) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validateNew(form, staff);
    if (problem) return setError(problem);
    onCreate(createRequests(form as NewRequest));
    setForm({ kind: form.kind });
    setError(null);
    setShowForm(false);
    setTab("pending");
  };

  const summary = (r: ShiftRequest) => {
    const days = r.endDate && r.endDate !== r.date ? `${dayLabel(r.date)}–${dayLabel(r.endDate)}` : dayLabel(r.date);
    const asked = r.kind === "turno" && r.shift ? ` · ${{ M: "mañanas", T: "tardes", N: "noches" }[r.shift]}` : "";
    return r.kind === "cambio" ? `${name(r.staffId)} ↔ ${name(r.withStaffId)} · ${days}${r.returnDate ? ` (devuelve el ${dayLabel(r.returnDate)})` : ""}` : `${name(r.staffId)} · ${days}${asked}`;
  };

  const list = tab === "pending" ? pending : done;

  return (
    <div className="fixed inset-0 z-50 print:hidden" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Solicitudes"
        onClick={(e) => e.stopPropagation()}
        className="anim-slide absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-card-solid shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-lg font-bold">Solicitudes</h2>
          <button ref={closeRef} onClick={onClose} aria-label="Cerrar" className="grid h-9 w-9 place-items-center rounded-xl transition hover:bg-brand/10 focus-visible:outline-2 focus-visible:outline-brand">
            <CloseIcon />
          </button>
        </header>

        <div className="flex items-center gap-2 px-4 pt-3">
          {(["pending", "done"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              aria-pressed={tab === t}
              className={`rounded-full px-3 py-1 text-sm font-semibold transition ${tab === t ? "bg-brand text-white" : "hover:bg-brand/10"}`}
            >
              {t === "pending" ? `Pendientes (${pending.length})` : `Resueltas (${done.length})`}
            </button>
          ))}
          <button
            onClick={() => setShowForm((v) => !v)}
            disabled={disabled}
            className="ml-auto flex items-center gap-1 rounded-full bg-accent/15 px-3 py-1 text-sm font-semibold text-accent transition hover:bg-accent/25 disabled:opacity-40"
          >
            <PlusIcon width={14} height={14} /> Nueva
          </button>
        </div>

        {showForm && (
          <form onSubmit={submit} className="anim-fade-up mx-4 mt-3 space-y-2 rounded-2xl border border-line p-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <label>
                <span className="text-xs text-muted">Quién lo pide</span>
                <select value={form.staffId ?? ""} onChange={(e) => setForm({ ...form, staffId: e.target.value })} className={inputCls}>
                  <option value="">elegir…</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="text-xs text-muted">Tipo</span>
                <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as RequestKind })} className={inputCls}>
                  {(Object.keys(KIND_LABEL) as RequestKind[]).map((k) => (
                    <option key={k} value={k}>{KIND_LABEL[k]}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="text-xs text-muted">{form.kind === "vacaciones" || form.kind === "turno" ? "Primer día" : "Día"}</span>
                <input type="date" value={form.date ?? ""} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputCls} />
              </label>
              {(form.kind === "vacaciones" || form.kind === "turno") && (
                <label>
                  <span className="text-xs text-muted">Último día</span>
                  <input type="date" value={form.endDate ?? ""} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className={inputCls} />
                </label>
              )}
              {form.kind === "turno" && (
                <label>
                  <span className="text-xs text-muted">Quiere hacer</span>
                  <select value={form.shift ?? ""} onChange={(e) => setForm({ ...form, shift: (e.target.value || undefined) as NewRequest["shift"] })} className={inputCls}>
                    <option value="">elegir…</option>
                    <option value="M">Mañanas</option>
                    <option value="T">Tardes</option>
                    <option value="N">Noches</option>
                  </select>
                </label>
              )}
              {form.kind === "cambio" && (
                <>
                  <label>
                    <span className="text-xs text-muted">Con quién</span>
                    <select value={form.withStaffId ?? ""} onChange={(e) => setForm({ ...form, withStaffId: e.target.value })} className={inputCls}>
                      <option value="">elegir…</option>
                      {staff.filter((s) => s.id !== form.staffId).map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="col-span-2">
                    <span className="text-xs text-muted">Devolver el día (opcional)</span>
                    <input type="date" value={form.returnDate ?? ""} onChange={(e) => setForm({ ...form, returnDate: e.target.value })} className={inputCls} />
                  </label>
                </>
              )}
            </div>
            <label className="block">
              <span className="text-xs text-muted">Nota (opcional)</span>
              <input value={form.note ?? ""} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Motivo, por si ayuda a decidir" className={inputCls} />
            </label>
            {error && <p role="alert" className="text-xs font-semibold text-red-600">{error}</p>}
            <button className="w-full rounded-xl bg-gradient-to-r from-brand to-brand-2 px-3 py-2 font-semibold text-white shadow transition hover:-translate-y-0.5 active:scale-95">
              Registrar solicitud
            </button>
          </form>
        )}

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {list.length === 0 && (
            <p className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted">
              {tab === "pending" ? "No hay solicitudes pendientes." : "Todavía no se ha resuelto ninguna."}
            </p>
          )}
          {list.map((r) => {
            const plan = plans.get(r.id);
            const rivals = r.status === "pending" ? competing(requests, r) : [];
            return (
              <article key={r.id} className="anim-fade-up rounded-2xl border border-line p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">{KIND_LABEL[r.kind]}</p>
                    <h3 className="font-semibold">{summary(r)}</h3>
                  </div>
                  {r.status !== "pending" && (
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.status === "approved" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-red-500/15 text-red-700 dark:text-red-300"}`}>
                      {r.status === "approved" ? "Aprobada" : "Rechazada"}
                    </span>
                  )}
                </div>
                {r.note && <p className="mt-1 text-sm text-muted">“{r.note}”</p>}
                {r.decisionNote && <p className="mt-1 text-sm">Respuesta: {r.decisionNote}</p>}

                {r.status === "pending" && (
                  <>
                    {plan ? (
                      <p className="mt-2 flex items-center gap-2 text-sm">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${LEVEL_DOT[plan.level]}`} aria-hidden="true" />
                        <span className="font-medium">{LEVEL_TEXT[plan.level]}</span>
                        {plan.changes.length > 0 && <span className="text-muted">· {plan.changes.length} casillas</span>}
                      </p>
                    ) : (
                      <p className="mt-2 text-sm text-muted">Calculando…</p>
                    )}
                    {plan?.reason && <p className="mt-1 text-xs text-red-700 dark:text-red-300">{plan.reason}</p>}
                    {plan?.notice?.short && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
                        <AlertIcon width={12} height={12} /> Con {plan.notice.daysAhead} días de antelación (lo recomendable es un mes)
                      </p>
                    )}
                    {rivals.length > 0 && (
                      <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                        Coincide con: {rivals.map((x) => `${name(x.staffId)} (${KIND_LABEL[x.kind].toLowerCase()} ${dayLabel(x.date)})`).join(", ")}
                      </p>
                    )}

                    {rejecting === r.id ? (
                      <div className="mt-2 space-y-2">
                        <input autoFocus value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder="Motivo (se lo podrás decir)" className={inputCls} />
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setRejecting(null)} className="rounded-lg px-3 py-1.5 text-sm hover:bg-brand/10">Cancelar</button>
                          <button
                            onClick={() => {
                              onReject(r, rejectNote);
                              setRejecting(null);
                              setRejectNote("");
                            }}
                            className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white"
                          >
                            Rechazar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 flex justify-end gap-2">
                        <button onClick={() => setRejecting(r.id)} disabled={disabled} className="rounded-xl border border-line px-3 py-1.5 text-sm font-semibold transition hover:bg-red-500/10 disabled:opacity-40">
                          Rechazar
                        </button>
                        <button
                          onClick={() => plan && onReview(r, plan)}
                          disabled={disabled || !plan}
                          className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand to-brand-2 px-3 py-1.5 text-sm font-semibold text-white shadow transition hover:-translate-y-0.5 active:scale-95 disabled:opacity-40"
                        >
                          <CheckIcon width={14} height={14} /> Revisar y aprobar
                        </button>
                      </div>
                    )}
                  </>
                )}
              </article>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
