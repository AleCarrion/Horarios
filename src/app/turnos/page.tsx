import type { Metadata } from "next";
import { AuthGate } from "@/components/AuthGate";
import { CatalogPage } from "@/components/CatalogPage";

export const metadata: Metadata = { title: "Turnos y puestos · Casa 1800" };

export default function Page() {
  return (
    <AuthGate editorsOnly>
      <CatalogPage />
    </AuthGate>
  );
}
