import type { Metadata } from "next";
import { AuthGate } from "@/components/AuthGate";
import { TeamPage } from "@/components/TeamPage";

export const metadata: Metadata = { title: "Equipo · Casa 1800" };

export default function Page() {
  return (
    <AuthGate>
      <TeamPage />
    </AuthGate>
  );
}
