"use client";

import { useState } from "react";
import { SECTIONS } from "@/lib/domain/team";
import type { Role, Staff } from "@/lib/domain/types";
import { ArrowDown, ArrowUp, ChevronDown, PlusIcon, TrashIcon } from "./icons";

interface Props {
  staff: Staff[];
  disabled?: boolean;
  onRename: (id: string, name: string) => void;
  onRole: (id: string, role: Role) => void;
  onDates: (id: string, field: "activeFrom" | "activeTo", value: string) => void;
  onNudge: (id: string, dir: -1 | 1) => void;
  onRemove: (id: string) => void;
  onAdd: (name: string, role: Role) => void;
}

const field =
  "rounded-lg border border-line bg-card-solid/60 px-2 py-1 text-sm transition hover:border-brand/50 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-brand";
const mini =
  "grid h-8 w-8 place-items-center rounded-lg text-muted transition hover:bg-brand/10 hover:text-brand disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-brand";

export function TeamPanel({ staff, disabled, onRename, onRole, onDates, onNudge, onRemove, onAdd }: Props) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("receptionist");

  return (
    <details className="glass group rounded-2xl p-4 text-sm print:hidden [&[open]>summary_svg]:rotate-180">
      <summary className="flex cursor-pointer list-none items-center justify-between font-semibold transition hover:text-brand [&::-webkit-details-marker]:hidden">
        <span>Equipo · puestos, orden y fechas de alta y baja</span>
        <ChevronDown width={16} height={16} className="transition-transform" />
      </summary>
      <p className="mt-2 text-muted">
        También puedes arrastrar a una persona por el asa de la cuadrícula; aquí tienes los mismos cambios con teclado.
        Cambiar el puesto o las fechas recalcula el mes alrededor de tus vacaciones y descansos marcados.
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th scope="col" className="pb-1 pr-3 font-medium">Nombre</th>
              <th scope="col" className="pb-1 pr-3 font-medium">Puesto</th>
              <th scope="col" className="pb-1 pr-3 font-medium">Alta</th>
              <th scope="col" className="pb-1 pr-3 font-medium">Baja</th>
              <th scope="col" className="pb-1 font-medium"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {SECTIONS.map(({ role: sectionRole, label }) => {
              const members = staff.filter((s) => s.role === sectionRole);
              if (!members.length) return null;
              return (
                <SectionRows key={sectionRole} label={label}>
                  {members.map((s, i) => (
                    <tr key={s.id} className="border-t border-line">
                      <td className="py-1.5 pr-3">
                        <input
                          aria-label={`Nombre de ${s.name}`}
                          defaultValue={s.name}
                          disabled={disabled}
                          onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== s.name && onRename(s.id, e.target.value.trim())}
                          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                          className={`${field} w-44`}
                        />
                      </td>
                      <td className="pr-3">
                        <select
                          aria-label={`Puesto de ${s.name}`}
                          value={s.role}
                          disabled={disabled}
                          onChange={(e) => onRole(s.id, e.target.value as Role)}
                          className={field}
                        >
                          {SECTIONS.map((x) => (
                            <option key={x.role} value={x.role}>{x.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="pr-3">
                        <input type="date" aria-label={`Alta de ${s.name}`} value={s.activeFrom ?? ""} disabled={disabled} onChange={(e) => onDates(s.id, "activeFrom", e.target.value)} className={field} />
                      </td>
                      <td className="pr-3">
                        <input type="date" aria-label={`Baja de ${s.name}`} value={s.activeTo ?? ""} disabled={disabled} onChange={(e) => onDates(s.id, "activeTo", e.target.value)} className={field} />
                      </td>
                      <td><div className="flex items-center">
                        <button type="button" className={mini} disabled={disabled || i === 0} onClick={() => onNudge(s.id, -1)} aria-label={`Subir a ${s.name}`} title="Subir">
                          <ArrowUp width={15} height={15} />
                        </button>
                        <button type="button" className={mini} disabled={disabled || i === members.length - 1} onClick={() => onNudge(s.id, 1)} aria-label={`Bajar a ${s.name}`} title="Bajar">
                          <ArrowDown width={15} height={15} />
                        </button>
                        <button
                          type="button"
                          className={`${mini} hover:!bg-red-500/10 hover:!text-red-600`}
                          disabled={disabled}
                          onClick={() => {
                            if (window.confirm(`¿Eliminar a ${s.name} del equipo? Desaparece de todos los meses. Si solo se va a partir de una fecha, usa la fecha de baja.`)) onRemove(s.id);
                          }}
                          aria-label={`Eliminar a ${s.name}`}
                          title="Eliminar del equipo"
                        >
                          <TrashIcon width={15} height={15} />
                        </button>
                      </div></td>
                    </tr>
                  ))}
                </SectionRows>
              );
            })}
          </tbody>
        </table>
      </div>

      <form
        className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          onAdd(name, role);
          setName("");
        }}
      >
        <label className="sr-only" htmlFor="new-name">Nombre de la nueva persona</label>
        <input id="new-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre de la nueva persona" disabled={disabled} className={`${field} w-56`} />
        <label className="sr-only" htmlFor="new-role">Puesto</label>
        <select id="new-role" value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={disabled} className={field}>
          {SECTIONS.map((x) => (
            <option key={x.role} value={x.role}>{x.label}</option>
          ))}
        </select>
        <button
          disabled={disabled || !name.trim()}
          className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand to-brand-2 px-3.5 py-2 font-semibold text-white shadow transition hover:-translate-y-0.5 hover:shadow-md active:scale-95 disabled:pointer-events-none disabled:opacity-40"
        >
          <PlusIcon width={15} height={15} /> Añadir
        </button>
      </form>
    </details>
  );
}

function SectionRows({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <tr>
        <th colSpan={5} scope="colgroup" className="pb-1 pt-3 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
          {label}
        </th>
      </tr>
      {children}
    </>
  );
}
