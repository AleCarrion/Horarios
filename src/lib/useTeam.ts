"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_STAFF } from "./domain/roster";
import type { Staff } from "./domain/types";
import { readRoster, writeRoster } from "./staffStore";
import type { AuthState } from "./useAuth";
import { useRemoteStaff } from "./useRemoteStaff";

/** The team (names, puestos, order, alta/baja): kept on the device and, with Supabase, in `public.staff`. */
export function useTeam(auth: AuthState) {
  const [staff, setStaff] = useState<Staff[]>(DEFAULT_STAFF);
  useEffect(() => {
    setStaff(readRoster()); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);

  const saveTeam = useCallback((next: Staff[]) => {
    setStaff(next);
    writeRoster(next);
  }, []);

  const remote = useRemoteStaff({
    auth,
    staff,
    onLoaded: (team) => {
      setStaff(team);
      writeRoster(team);
    },
  });

  return { staff, saveTeam, pending: remote.pending } as const;
}
