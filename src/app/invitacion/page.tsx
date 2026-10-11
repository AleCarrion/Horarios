import type { Metadata } from "next";
import { InvitePage } from "@/components/InvitePage";

export const metadata: Metadata = { title: "Invitación · Casa 1800" };

export default function Page() {
  return <InvitePage />;
}
