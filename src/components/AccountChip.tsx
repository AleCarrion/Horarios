"use client";

import Link from "next/link";
import { SYNC_DOT, SYNC_LABEL, type SyncStatus } from "@/lib/syncStatus";
import type { AuthState } from "@/lib/useAuth";

/** Round button in the header: who is signed in (initial + sync dot) and the way to the account page. */
export function AccountChip({ auth, status }: { auth: AuthState; status?: SyncStatus }) {
  if (!auth.email)
    return (
      <Link href="/entrar" className="rounded-xl bg-brand-solid px-3 py-1.5 text-sm font-semibold text-white shadow transition hover:brightness-110 active:scale-95">
        Entrar
      </Link>
    );
  const role = auth.isAdmin ? "administradora" : auth.isEditor ? "editora" : auth.isWorker ? "trabajador" : "solo lectura";
  return (
    <Link
      href="/cuenta"
      aria-label={`Mi cuenta: ${auth.email}, ${role}${status ? `, ${SYNC_LABEL[status].toLowerCase()}` : ""}`}
      title={`${auth.email} · ${role}${status ? ` · ${SYNC_LABEL[status]}` : ""}`}
      className="relative grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-brand to-brand-2 text-lg font-bold uppercase text-white shadow-md shadow-brand/30 ring-2 ring-white/70 transition hover:-translate-y-0.5 hover:shadow-lg active:scale-95 dark:ring-white/10"
    >
      {auth.email[0]}
      {status && <span aria-hidden="true" className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full ring-2 ring-white dark:ring-slate-900 ${SYNC_DOT[status]}`} />}
    </Link>
  );
}
