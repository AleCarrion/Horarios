import type { Metadata } from "next";
import { AccessPage } from "@/components/AccessPage";
import { AuthGate } from "@/components/AuthGate";

export const metadata: Metadata = { title: "Accesos · Casa 1800" };

export default function Page() {
  return (
    <AuthGate editorsOnly>
      <AccessPage />
    </AuthGate>
  );
}
