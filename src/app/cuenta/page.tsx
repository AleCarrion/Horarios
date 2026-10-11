import type { Metadata } from "next";
import { AuthGate } from "@/components/AuthGate";
import { AccountPage } from "@/components/AccountPage";

export const metadata: Metadata = { title: "Mi cuenta · Casa 1800" };

export default function Page() {
  return (
    <AuthGate>
      <AccountPage />
    </AuthGate>
  );
}
