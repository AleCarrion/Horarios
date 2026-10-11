export type SyncStatus = "local" | "synced" | "pending" | "readonly" | "draft";

export const SYNC_LABEL: Record<SyncStatus, string> = {
  local: "Modo local (sin Supabase)",
  synced: "Sincronizado",
  pending: "Cambios pendientes de enviar",
  readonly: "Solo lectura",
  draft: "Borrador sin publicar",
};

export const SYNC_DOT: Record<SyncStatus, string> = {
  local: "bg-slate-400",
  synced: "bg-emerald-500",
  pending: "bg-amber-500",
  readonly: "bg-slate-400",
  draft: "bg-sky-500",
};
