"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "./supabase";

/** The newest migration this version of the app needs (supabase/migrations). Raise it together with `schema_level()`. */
export const REQUIRED_SCHEMA = 10;

/** Asks the database which migration it is at; returns true when it is older than the app needs (only the admin is told). */
export function useSchemaOutdated(enabled: boolean): boolean {
  const [outdated, setOutdated] = useState(false);
  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !enabled) return;
    void sb.rpc("schema_level").then(({ data, error }) => {
      if (error?.message && /fetch|network/i.test(error.message) && !error.code) return; // offline: no news
      setOutdated(Boolean(error) || Number(data) < REQUIRED_SCHEMA);
    });
  }, [enabled]);
  return outdated;
}
