"use client";

import { useCallback, useEffect, useRef } from "react";
import { fromCatalogRow, toCatalogRow, toShiftRows } from "./catalogSync";
import { readCatalog, setCatalog } from "./catalogStore";
import { DEFAULT_CATALOG, type Catalog } from "./domain/catalog";
import { getSupabase } from "./supabase";
import type { AuthState } from "./useAuth";
import { channelName } from "./realtime";

const DIRTY = "horarios_catalog_dirty"; // not "horarios:" so it is not part of the data backups
const isDirty = () => {
  try {
    return localStorage.getItem(DIRTY) === "1";
  } catch {
    return false;
  }
};
const setDirty = (on: boolean) => {
  try {
    if (on) localStorage.setItem(DIRTY, "1");
    else localStorage.removeItem(DIRTY);
  } catch {}
};

/**
 * The hotel's names, colours and puestos are shared between devices through `public.app_catalog`.
 * Mounted once for the whole app (CatalogProvider); the settings page uses it with `listen: false`, only to save.
 * `save` returns an error message when sending failed (it is retried when the page is opened again).
 */
export function useRemoteCatalog(auth: AuthState, { listen = true }: { listen?: boolean } = {}) {
  const sb = getSupabase();
  const canEdit = Boolean(sb) && auth.isEditor;
  const saving = useRef(Promise.resolve<string | null>(null));

  const push = useCallback(
    async (c: Catalog): Promise<string | null> => {
      if (!sb || !canEdit) return null;
      // the shifts table first: the schedule references it
      const a = await sb.from("shifts").upsert(toShiftRows(c), { onConflict: "code" });
      if (a.error) return a.error.message;
      const b = await sb.from("app_catalog").upsert(toCatalogRow(c), { onConflict: "id" });
      return b.error ? b.error.message : null;
    },
    [sb, canEdit],
  );

  useEffect(() => {
    if (!sb || !listen || !auth.ready || !auth.email) return;
    let alive = true;
    void sb
      .from("app_catalog")
      .select("catalog")
      .eq("id", 1)
      .maybeSingle()
      .then(async ({ data, error }) => {
        if (!alive || error) return;
        const local = readCatalog();
        const customised = JSON.stringify(local) !== JSON.stringify(DEFAULT_CATALOG);
        if (canEdit && (isDirty() || (!data && customised))) {
          // this device has something the server does not know yet: send it
          if (!(await push(local))) setDirty(false);
        } else if (data) setCatalog(fromCatalogRow(data));
      });
    const channel = sb
      .channel(channelName("catalog"))
      .on("postgres_changes", { event: "*", schema: "public", table: "app_catalog" }, (p) => {
        const row = p.new as { catalog?: unknown } | undefined;
        if (row?.catalog) setCatalog(fromCatalogRow({ catalog: row.catalog }));
      })
      .subscribe();
    return () => {
      alive = false;
      void sb.removeChannel(channel);
    };
  }, [sb, listen, auth.ready, auth.email, canEdit, push]);

  /** Applies the change here at once and sends it to the server (after the previous save, so order is kept). */
  const save = useCallback(
    (c: Catalog): Promise<string | null> => {
      setCatalog(c, { remount: false });
      if (!sb || !canEdit) return Promise.resolve(null);
      setDirty(true);
      saving.current = saving.current.then(async () => {
        const err = await push(c);
        if (!err) setDirty(false);
        return err;
      });
      return saving.current;
    },
    [sb, canEdit, push],
  );
  return { save } as const;
}
