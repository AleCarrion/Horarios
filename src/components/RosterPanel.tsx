"use client";

import { ChevronDown } from "./icons";
import type { Staff } from "@/lib/domain/types";
import type { RosterOverrides } from "@/lib/rosterConfig";

interface Props {
  staff: Staff[];
  overrides: RosterOverrides;
  disabled?: boolean;
  onChange: (id: string, field: "activeFrom" | "activeTo", value: string) => void;
}

export function RosterPanel({ staff, overrides, disabled, onChange }: Props) {
  const input =
    "rounded-lg border border-line bg-card-solid/60 px-2 py-1 text-sm transition hover:border-brand/50 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-brand";
  return (
    <details className="glass group rounded-2xl p-4 text-sm print:hidden [&[open]>summary_svg]:rotate-180">
      <summary className="flex cursor-pointer list-none items-center justify-between font-semibold transition hover:text-brand [&::-webkit-details-marker]:hidden">
        <span>Plantilla · fechas de alta y baja</span>
        <ChevronDown width={16} height={16} className="transition-transform" />
      </summary>
      <p className="mt-2 text-muted">
        Los días anteriores al alta y posteriores a la baja salen en negro (fuera de plantilla) y nadie los trabaja.
        Al cambiar una fecha se recalcula el mes alrededor de tus vacaciones y descansos marcados. Las fechas se guardan en este dispositivo.
      </p>
      <table className="mt-2">
        <thead>
          <tr className="text-left">
            <th scope="col" className="pr-4">Persona</th>
            <th scope="col" className="pr-4">Alta</th>
            <th scope="col">Baja</th>
          </tr>
        </thead>
        <tbody>
          {staff.map((s) => (
            <tr key={s.id}>
              <th scope="row" className="py-1 pr-4 text-left font-medium">{s.name}</th>
              <td className="pr-4">
                <input
                  type="date"
                  aria-label={`Alta de ${s.name}`}
                  value={overrides[s.id]?.activeFrom ?? ""}
                  disabled={disabled}
                  onChange={(e) => onChange(s.id, "activeFrom", e.target.value)}
                  className={input}
                />
              </td>
              <td>
                <input
                  type="date"
                  aria-label={`Baja de ${s.name}`}
                  value={overrides[s.id]?.activeTo ?? ""}
                  disabled={disabled}
                  onChange={(e) => onChange(s.id, "activeTo", e.target.value)}
                  className={input}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
