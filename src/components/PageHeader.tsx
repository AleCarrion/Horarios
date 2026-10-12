"use client";

import type { ComponentProps } from "react";
import { remoteConfigured } from "@/lib/supabase";
import type { AuthState } from "@/lib/useAuth";
import { AccountChip } from "./AccountChip";
import { AppNav } from "./AppNav";
import { LogoMark } from "./icons";

/** The same top bar on every page (logo, sections, account), as wide as the schedule's so nothing jumps when moving between pages. */
export function PageHeader({ auth, status }: { auth?: AuthState; status?: ComponentProps<typeof AccountChip>["status"] }) {
  return (
    <header className="glass sticky top-0 z-30 border-x-0 border-t-0 pt-[env(safe-area-inset-top)] print:hidden">
      <div className={`${PAGE_WIDTH} flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3`}>
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-brand to-brand-2 shadow-lg shadow-brand/30 sm:h-11 sm:w-11">
            <LogoMark />
          </span>
          <div className="leading-tight">
            <p className="text-lg font-bold tracking-tight">Horarios</p>
            <p className="text-xs text-muted">Hotel Casa 1800</p>
          </div>
        </div>
        <div className="max-sm:hidden"><AppNav /></div>
        {remoteConfigured && auth?.email && <div className="ml-auto"><AccountChip auth={auth} status={status ?? "synced"} /></div>}
      </div>
    </header>
  );
}

/** Width of every page (header and content), left edges in line. */
export const PAGE_WIDTH = "mx-auto w-full min-w-0 max-w-[1500px]";
