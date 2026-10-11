import type { Metadata } from "next";
import { LoginPage } from "@/components/LoginPage";

export const metadata: Metadata = { title: "Entrar · Casa 1800" };

export default function Page() {
  return <LoginPage />;
}
