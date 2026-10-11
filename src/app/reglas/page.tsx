import type { Metadata } from "next";
import { AuthGate } from "@/components/AuthGate";
import { RulesPage } from "@/components/RulesPage";

export const metadata: Metadata = { title: "Reglas · Casa 1800" };

export default function Page() {
  return (
    <AuthGate editorsOnly>
      <RulesPage />
    </AuthGate>
  );
}
