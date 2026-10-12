"use client";

import { Fragment, useEffect, type ReactNode } from "react";
import { startCatalog, useCatalogVersion } from "@/lib/catalogStore";
import { useAuth } from "@/lib/useAuth";
import { useRemoteCatalog } from "@/lib/useRemoteCatalog";

/**
 * Applies the hotel's names, letters, hours and colours to the whole app: reads them from this device at start,
 * follows the server, and repaints everything (a new `key`) when they change.
 */
export function CatalogProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  useRemoteCatalog(auth);
  const version = useCatalogVersion();
  useEffect(() => {
    startCatalog();
  }, []);
  return <Fragment key={version}>{children}</Fragment>;
}
