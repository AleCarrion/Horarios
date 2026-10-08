"use client";

import { useMemo, useRef, useState } from "react";
import { MONTHS } from "@/lib/ui";
import { firstEditable } from "@/lib/domain/repair";
import { addStaff, changeRole, moveStaff, SECTIONS, updateStaff } from "@/lib/domain/team";
import type { Role, Staff } from "@/lib/domain/types";
import { applyTeamChange, planTeamChange, type MonthPlan } from "@/lib/teamPlanning";
import { remoteConfigured } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";
import { useTeam } from "@/lib/useTeam";
import { useEffect } from "react";
import { AuthBar } from "./AuthBar";
import { AppNav } from "./AppNav";
import { ArrowDown, ArrowUp, GripIcon, LogoMark, PlusIcon, UsersIcon } from "./icons";
import { PlanDialog } from "./PlanDialog";

const ROLE_COLOR: Record<Role, string> = {
  night_auditor: "from-indigo-500 to-blue-700",
  director: "from-sky-500 to-blue-600",
  senior: "from-violet-500 to-fuchsia-600",
  receptionist: "from-amber-400 to-orange-600",
  mozo: "from-cyan-400 to-teal-600",
};
const ROLE_ACCENT: Record<Role, string> = {
  night_auditor: "bg-indigo-500",
  director: "bg-sky-500",
  senior: "bg-violet-500",
  receptionist: "bg-orange-500",
  mozo: "bg-teal-500",
};
const ROLE_RULES: Record<Role, string> = {
  director: "Supervisión de lunes a viernes (9:15–17:15). Libra fines de semana y festivos. Nunca noches.",
  senior: "Partido (9:15–17:15). Descansa unos 10 días al mes y nunca coinciden los dos. Pueden cubrir mañanas (y tardes, quien tenga permiso).",
  receptionist: "Rotan mañana, tarde y noche en bloques de 3–5 días. Cubren las noches cuando libra el auditor.",
  night_auditor: "Siempre de noche (23:00–07:00). Cuando descansa, las noches las cubre recepción.",
  mozo: "Turno de 11:00 a 19:00 en ciclos de 5 días de trabajo y 5 de descanso. Uno trabaja siempre.",
};
const initials = (name: string) =>
  name.split(/[\s.]+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDay = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
};

const field =
  "rounded-lg border border-line bg-card-solid/60 px-2 py-1.5 text-sm transition hover:border-brand/50 focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-40";

export function TeamPage() {
  const auth = useAuth();
  const { staff, saveTeam, pending } = useTeam(auth);
  const readOnly = remoteConfigured && !auth.isEditor;

  const [today, setToday] = useState<string | null>(null);
  useEffect(() => {
    setToday(isoDay(new Date())); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);

  const [proposal, setProposal] = useState<{ title: string; next: Staff[]; plans: MonthPlan[] } | null>(null);
  const [adding, setAdding] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const now = today ?? isoDay(new Date(0));
  const editableStart = () => {
    const f = firstEditable({ today: today ?? undefined });
    return f ?? now;
  };

  // People who are on the roster this month vs people who already left (or have not started yet)
  const { onRoster, gone } = useMemo(() => {
    // gone = their baja is already in effect; people who start in the future stay in the list with an "Alta" badge
    const left = (p: Staff) => Boolean(p.activeTo && today && p.activeTo < editableStartIso(today));
    return { onRoster: staff.filter((p) => !left(p)), gone: staff.filter(left) };
  }, [staff, today]);

  /** Changes that alter who works: plan every affected month and show it before applying. */
  const propose = (next: Staff[], title: string) => {
    if (next === staff || !today) return;
    setProposal({ title, next, plans: planTeamChange(staff, next, today) });
  };
  const apply = () => {
    if (!proposal) return;
    applyTeamChange(proposal.next, proposal.plans);
    saveTeam(proposal.next);
    setProposal(null);
  };

  const move = (id: string, role: Role, beforeId: string | null) => {
    const next = moveStaff(staff, id, role, beforeId);
    if (next === staff) return;
    const person = staff.find((p) => p.id === id)!;
    if (person.role === role) saveTeam(next);
    else propose(next, `${person.name}: nuevo puesto`);
  };
  const nudge = (id: string, dir: -1 | 1) => {
    const me = staff.find((p) => p.id === id)!;
    const peers = staff.filter((p) => p.role === me.role);
    const i = peers.findIndex((p) => p.id === id);
    const j = i + dir;
    if (j < 0 || j >= peers.length) return;
    saveTeam(moveStaff(staff, id, me.role, dir === -1 ? peers[j].id : (peers[j + 1]?.id ?? null)));
  };

  const [form, setForm] = useState<{ name: string; role: Role; from: string }>({ name: "", role: "receptionist", from: "" });
  const submitNew = (e: React.FormEvent) => {
    e.preventDefault();
    const next = addStaff(staff, { name: form.name, role: form.role });
    const added = next.find((p) => !staff.some((q) => q.id === p.id));
    if (!added) return;
    setAdding(false);
    propose(updateStaff(next, added.id, { activeFrom: form.from || editableStart() }), `Nueva persona: ${form.name.trim()}`);
    setForm({ name: "", role: form.role, from: "" });
  };

  const counts = SECTIONS.map(({ role, label }) => ({ role, label, n: onRoster.filter((p) => p.role === role).length }));
  const dropRef = useRef<string | null>(null);

  const person = (p: Staff, i: number, list: Staff[]) => {
    const leaving = p.activeTo && today && p.activeTo >= editableStart();
    const starting = p.activeFrom && today && p.activeFrom > today;
    return (
      <li
        key={p.id}
        draggable={!readOnly}
        onDragStart={(e) => {
          setDragId(p.id);
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", p.id);
        }}
        onDragEnd={() => {
          setDragId(null);
          setOverId(null);
        }}
        onDragOver={(e) => {
          if (!dragId || dragId === p.id) return;
          e.preventDefault();
          setOverId(p.id);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (dragId) move(dragId, p.role, p.id);
          setDragId(null);
          setOverId(null);
        }}
        className={`anim-fade-up group rounded-2xl border bg-card-solid/70 p-3 transition duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
          overId === p.id ? "border-accent shadow-[0_-3px_0_0_var(--accent)]" : "border-line"
        } ${dragId === p.id ? "opacity-40" : ""}`}
        style={{ animationDelay: `${i * 35}ms` }}
      >
        <div className="flex flex-wrap items-center gap-3">
          {!readOnly && <GripIcon width={16} height={16} className="cursor-grab text-muted opacity-40 transition group-hover:opacity-100 active:cursor-grabbing" aria-hidden="true" />}
          <span aria-hidden="true" className={`grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br text-sm font-bold text-white shadow ${ROLE_COLOR[p.role]}`}>
            {initials(p.name)}
          </span>
          <div className="min-w-0 flex-1">
            <input
              aria-label={`Nombre de ${p.name}`}
              defaultValue={p.name}
              disabled={readOnly}
              onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== p.name && saveTeam(updateStaff(staff, p.id, { name: e.target.value.trim() }))}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              className="w-full max-w-56 rounded-lg bg-transparent px-1.5 py-0.5 text-base font-semibold transition hover:bg-brand/5 focus:bg-card-solid focus-visible:outline-2 focus-visible:outline-brand"
            />
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 px-1.5">
              {leaving && <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:text-red-300">Baja el {p.activeTo!.slice(8)}/{p.activeTo!.slice(5, 7)}</span>}
              {starting && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">Alta el {p.activeFrom!.slice(8)}/{p.activeFrom!.slice(5, 7)}</span>}
              {!leaving && !starting && <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand">En plantilla</span>}
            </div>
          </div>
          <select
            aria-label={`Puesto de ${p.name}`}
            value={p.role}
            disabled={readOnly}
            onChange={(e) => propose(changeRole(staff, p.id, e.target.value as Role), `${p.name}: nuevo puesto`)}
            className={field}
          >
            {SECTIONS.map((x) => (
              <option key={x.role} value={x.role}>{x.label}</option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            <button type="button" disabled={readOnly || i === 0} onClick={() => nudge(p.id, -1)} aria-label={`Subir a ${p.name}`} title="Subir" className="grid h-8 w-8 place-items-center rounded-lg text-muted transition hover:bg-brand/10 hover:text-brand disabled:pointer-events-none disabled:opacity-30">
              <ArrowUp width={15} height={15} />
            </button>
            <button type="button" disabled={readOnly || i === list.length - 1} onClick={() => nudge(p.id, 1)} aria-label={`Bajar a ${p.name}`} title="Bajar" className="grid h-8 w-8 place-items-center rounded-lg text-muted transition hover:bg-brand/10 hover:text-brand disabled:pointer-events-none disabled:opacity-30">
              <ArrowDown width={15} height={15} />
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3 text-xs text-muted">
          <label className="flex items-center gap-2">
            Alta
            <input type="date" aria-label={`Alta de ${p.name}`} value={p.activeFrom ?? ""} disabled={readOnly} onChange={(e) => propose(updateStaff(staff, p.id, { activeFrom: e.target.value || undefined }), `${p.name}: alta`)} className={field} />
          </label>
          <label className="flex items-center gap-2">
            Baja
            <input type="date" aria-label={`Baja de ${p.name}`} value={p.activeTo ?? ""} disabled={readOnly} onChange={(e) => propose(updateStaff(staff, p.id, { activeTo: e.target.value || undefined }), `${p.name}: baja`)} className={field} />
          </label>
          <button
            type="button"
            disabled={readOnly || Boolean(p.activeTo)}
            onClick={() => propose(updateStaff(staff, p.id, { activeTo: addDay(editableStart(), -1) }), `${p.name}: baja`)}
            aria-label={`Dar de baja a ${p.name}`}
            className="ml-auto rounded-lg px-3 py-1.5 font-semibold text-red-600 transition hover:bg-red-500/10 disabled:pointer-events-none disabled:opacity-30"
          >
            Dar de baja
          </button>
        </div>
      </li>
    );
  };

  return (
    <>
      <header className="glass top-0 z-30 border-x-0 border-t-0 sm:sticky">
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-brand to-brand-2 shadow-lg shadow-brand/30">
              <LogoMark />
            </span>
            <div className="leading-tight">
              <h1 className="text-lg font-bold tracking-tight">Horarios</h1>
              <p className="text-xs text-muted">Hotel Casa 1800</p>
            </div>
          </div>
          <AppNav />
        </div>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-[1200px] space-y-5 p-4">
        {remoteConfigured && <AuthBar auth={auth} status={readOnly ? "readonly" : pending ? "pending" : "synced"} />}

        <div className="anim-fade-up flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Equipo</h2>
            <p className="mt-1 max-w-xl text-sm text-muted">
              Quién trabaja en el hotel, en qué puesto y desde cuándo. Arrastra a una persona para reordenarla o cambiarla de puesto: el horario se reajusta alrededor y ves los cambios antes de aplicarlos.
            </p>
          </div>
          <button
            onClick={() => setAdding(true)}
            disabled={readOnly}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-accent to-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent/30 transition hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0 active:scale-95 disabled:pointer-events-none disabled:opacity-40"
          >
            <PlusIcon width={16} height={16} /> Añadir persona
          </button>
        </div>

        <section aria-label="Resumen del equipo" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="glass anim-fade-up col-span-2 flex items-center gap-3 rounded-2xl p-3 sm:col-span-3 lg:col-span-1">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand/10 text-brand"><UsersIcon /></span>
            <div>
              <div className="text-xs text-muted">En plantilla</div>
              <div className="text-xl font-bold">{onRoster.length}</div>
            </div>
          </div>
          {counts.map((c, i) => (
            <div key={c.role} className="glass anim-fade-up flex items-center gap-3 rounded-2xl p-3" style={{ animationDelay: `${(i + 1) * 40}ms` }}>
              <span className={`h-9 w-1.5 rounded-full ${ROLE_ACCENT[c.role]}`} aria-hidden="true" />
              <div>
                <div className="text-xs text-muted">{c.label}</div>
                <div className="text-xl font-bold">{c.n}</div>
              </div>
            </div>
          ))}
        </section>

        <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
          <div className="space-y-5">
            {SECTIONS.map(({ role, label }) => {
              const members = onRoster.filter((p) => p.role === role);
              return (
                <section
                  key={role}
                  aria-label={label}
                  onDragOver={(e) => {
                    if (!dragId) return;
                    e.preventDefault();
                    dropRef.current = role;
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragId) move(dragId, role, null);
                    setDragId(null);
                    setOverId(null);
                  }}
                  className={`glass rounded-3xl p-4 transition ${dragId ? "ring-2 ring-dashed ring-accent/40" : ""}`}
                >
                  <div className="mb-3 flex items-center gap-2">
                    <span className={`h-5 w-1.5 rounded-full ${ROLE_ACCENT[role]}`} aria-hidden="true" />
                    <h3 className="text-base font-bold">{label}</h3>
                    <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand">{members.length}</span>
                  </div>
                  {members.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-line p-5 text-center text-sm text-muted">
                      Nadie en este puesto. Arrastra aquí a alguien o añade a una persona nueva.
                    </p>
                  ) : (
                    <ul className="space-y-3">{members.map((p, i) => person(p, i, members))}</ul>
                  )}
                </section>
              );
            })}

            {gone.length > 0 && (
              <details className="glass rounded-3xl p-4">
                <summary className="cursor-pointer font-semibold">Fuera de plantilla ({gone.length})</summary>
                <ul className="mt-3 space-y-2 text-sm">
                  {gone.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-2.5">
                      <span aria-hidden="true" className={`grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br text-xs font-bold text-white opacity-60 ${ROLE_COLOR[p.role]}`}>{initials(p.name)}</span>
                      <span className="font-semibold">{p.name}</span>
                      <span className="text-muted">
                        {p.activeFrom && p.activeFrom > now ? `Alta el ${p.activeFrom}` : p.activeTo ? `Baja desde el ${addDay(p.activeTo, 1)}` : ""}
                      </span>
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => propose(updateStaff(staff, p.id, { activeTo: undefined, activeFrom: p.activeFrom && p.activeFrom > now ? p.activeFrom : undefined }), `${p.name}: vuelve a la plantilla`)}
                        className="ml-auto rounded-lg px-3 py-1.5 font-semibold text-brand transition hover:bg-brand/10 disabled:opacity-40"
                      >
                        Volver a la plantilla
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          <aside className="space-y-3 lg:sticky lg:top-24 lg:self-start" aria-label="Cómo trabaja cada puesto">
            <div className="glass anim-fade-up rounded-3xl p-4">
              <h3 className="text-sm font-bold">Cómo trabaja cada puesto</h3>
              <p className="mt-1 text-xs text-muted">Son las reglas con las que se reajusta el horario cuando cambias el equipo.</p>
              <ul className="mt-3 space-y-3">
                {SECTIONS.map(({ role, label }) => (
                  <li key={role} className="flex gap-2.5 text-xs">
                    <span className={`mt-0.5 h-4 w-1.5 shrink-0 rounded-full ${ROLE_ACCENT[role]}`} aria-hidden="true" />
                    <span>
                      <b className="text-sm">{label}</b>
                      <span className="mt-0.5 block text-muted">{ROLE_RULES[role]}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </main>

      {adding && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm" onClick={() => setAdding(false)}>
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-title"
            onSubmit={submitNew}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.key === "Escape" && setAdding(false)}
            className="anim-menu w-full max-w-md space-y-4 rounded-3xl bg-card-solid p-6 shadow-2xl"
          >
            <h2 id="add-title" className="text-lg font-bold">Añadir persona</h2>
            <label className="block text-sm">
              <span className="text-xs text-muted">Nombre</span>
              <input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre de la nueva persona" aria-label="Nombre de la nueva persona" className={`${field} mt-1 w-full`} />
            </label>
            <fieldset>
              <legend className="text-xs text-muted">Puesto</legend>
              <div className="mt-1 flex flex-wrap gap-2">
                {SECTIONS.map((x) => (
                  <button
                    key={x.role}
                    type="button"
                    aria-pressed={form.role === x.role}
                    onClick={() => setForm({ ...form, role: x.role })}
                    className={`rounded-full border px-3 py-1 text-sm font-medium transition ${form.role === x.role ? "border-transparent bg-brand text-white" : "border-line hover:bg-brand/10"}`}
                  >
                    {x.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">{ROLE_RULES[form.role]}</p>
            </fieldset>
            <label className="block text-sm">
              <span className="text-xs text-muted">Empieza el</span>
              <input type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} aria-label="Empieza el" className={`${field} mt-1 w-full`} />
              <span className="mt-1 block text-xs text-muted">Si lo dejas vacío, empieza el primer día que se puede cambiar ({editableStart().slice(8)} de {MONTHS[Number(editableStart().slice(5, 7)) - 1].toLowerCase()}).</span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setAdding(false)} className="rounded-xl border border-line px-4 py-2 text-sm font-semibold transition hover:bg-brand/10">Cancelar</button>
              <button disabled={!form.name.trim()} className="rounded-xl bg-gradient-to-r from-brand to-brand-2 px-4 py-2 text-sm font-semibold text-white shadow transition hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-40">
                Ver cambios
              </button>
            </div>
          </form>
        </div>
      )}

      {proposal && (
        <PlanDialog
          title={proposal.title}
          staff={proposal.next}
          plan={proposal.plans[0].plan}
          label={proposal.plans.length > 1 ? `${MONTHS[proposal.plans[0].m - 1]} ${proposal.plans[0].y}` : undefined}
          others={proposal.plans.slice(1).map((p) => ({ label: `${MONTHS[p.m - 1]} ${p.y}`, plan: p.plan }))}
          onApply={apply}
          onCancel={() => setProposal(null)}
        />
      )}
    </>
  );
}

/** First day that a baja can take effect, for deciding who already left. */
function editableStartIso(today: string) {
  return firstEditable({ today }) ?? today;
}
