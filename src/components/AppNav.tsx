"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getStoredRole } from "@/lib/session";
import { CalendarIcon, SlidersIcon, UsersIcon } from "./icons";

const LINKS = [
  { href: "/", label: "Horario", Icon: CalendarIcon },
  { href: "/equipo", label: "Equipo", Icon: UsersIcon },
  { href: "/reglas", label: "Reglas", Icon: SlidersIcon },
];

/** Horario / Equipo tabs shared by every page header. */
export function AppNav() {
  const path = usePathname();
  const [worker, setWorker] = useState(false);
  useEffect(() => {
    setWorker(getStoredRole() === "worker"); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);
  return (
    <nav aria-label="Secciones" className="flex items-center gap-1 rounded-2xl border border-line bg-card-solid/60 p-1">
      {LINKS.filter((l) => !worker || l.href === "/").map(({ href, label, Icon }) => {
        const active = path === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-brand ${
              active ? "bg-gradient-to-r from-brand to-brand-2 text-white shadow" : "text-muted hover:bg-brand/10 hover:text-foreground"
            }`}
          >
            <Icon width={15} height={15} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
