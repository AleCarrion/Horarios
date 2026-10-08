"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarIcon, InboxIcon, SlidersIcon, UsersIcon } from "./icons";

interface Props {
  /** Number of pending requests (badge). */
  pending?: number;
  /** On the schedule page the inbox opens in place; elsewhere the tab links to it. */
  onRequests?: () => void;
}

/** Thumb-reach navigation for phones: Horario · Equipo · Solicitudes. */
export function MobileTabBar({ pending = 0, onRequests }: Props) {
  const path = usePathname();
  const tab = "relative flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[11px] font-semibold transition active:scale-95 focus-visible:outline-2 focus-visible:outline-brand";
  const on = "text-brand";
  const off = "text-muted";
  return (
    <nav
      aria-label="Secciones"
      className="glass fixed inset-x-0 bottom-0 z-40 flex gap-1 border-x-0 border-b-0 px-3 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] sm:hidden print:hidden"
    >
      <Link href="/" aria-current={path === "/" ? "page" : undefined} className={`${tab} ${path === "/" ? on : off}`}>
        <CalendarIcon width={22} height={22} />
        Horario
      </Link>
      <Link href="/equipo" aria-current={path === "/equipo" ? "page" : undefined} className={`${tab} ${path === "/equipo" ? on : off}`}>
        <UsersIcon width={22} height={22} />
        Equipo
      </Link>
      <Link href="/reglas" aria-current={path === "/reglas" ? "page" : undefined} className={`${tab} ${path === "/reglas" ? on : off}`}>
        <SlidersIcon width={22} height={22} />
        Reglas
      </Link>
      {onRequests ? (
        <button onClick={onRequests} className={`${tab} ${off}`}>
          <InboxIcon width={22} height={22} />
          Solicitudes
          {pending > 0 && <span className="absolute right-[22%] top-0 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">{pending}</span>}
        </button>
      ) : (
        <Link href="/?solicitudes=1" className={`${tab} ${off}`}>
          <InboxIcon width={22} height={22} />
          Solicitudes
          {pending > 0 && <span className="absolute right-[22%] top-0 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">{pending}</span>}
        </Link>
      )}
    </nav>
  );
}
