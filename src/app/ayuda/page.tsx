import type { Metadata } from "next";
import { HelpPage } from "@/components/HelpPage";

export const metadata: Metadata = { title: "Ayuda · Casa 1800" };

export default function Page() {
  return <HelpPage />;
}
