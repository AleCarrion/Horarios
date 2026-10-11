"use client";

import Link from "next/link";
import { SYNC_DOT, SYNC_LABEL, type SyncStatus } from "@/lib/syncStatus";
import type { AuthState } from "@/lib/useAuth";

/** Round button in the header: who is signed in (initial + sync dot) and the way to the account page. */
export function AccountChip({ auth, status }: { auth: AuthState; status?: SyncStatus }) {
  if (!auth.email)
    return (
      <Link href="/entrar" className="rounded-xl bg-brand px-3 py-1.5 text-sm font-semibold text-white shadow transition hover:brightness-110 active:scale-95">
        Entrar
      </Link>
    );
  const role = auth.isAdmin ? "administradora" : auth.isEditor ? "editora" : "solo lectura";
  return (
    <Link
      href="/cuenta"
      aria-label={`Mi cuenta: ${auth.email}, ${role}${status ? `, ${SYNC_LABEL[status].toLowerCase()}` : ""}`}
      title={`${auth.email} · ${role}${status ? ` · ${SYNC_LABEL[status]}` : ""}`}
      className="glass relative flex h-10 items-center gap-2 rounded-full pl-1 pr-1 transition hover:-translate-y-0.5 hover:shadow-md active:scale-95 sm:pr-3"
    >
      <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-brand to-brand-2 text-sm font-bold uppercase text-white">{auth.email[0]}</span>
      <span className="max-w-32 truncate text-sm font-semibold max-sm:hidden">{auth.email.split("@")[0]}</span>
      {status && <span aria-hidden="true" className={`absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full ring-2 ring-white dark:ring-slate-900 ${SYNC_DOT[status]}`} />}
    </Link>
  );
}
