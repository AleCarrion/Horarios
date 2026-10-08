import type { Metadata } from "next";
import { TeamPage } from "@/components/TeamPage";

export const metadata: Metadata = { title: "Equipo · Casa 1800" };

export default function Page() {
  return <TeamPage />;
}
