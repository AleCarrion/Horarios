import type { Metadata } from "next";
import { AccessPage } from "@/components/AccessPage";

export const metadata: Metadata = { title: "Accesos · Casa 1800" };

export default function Page() {
  return <AccessPage />;
}
