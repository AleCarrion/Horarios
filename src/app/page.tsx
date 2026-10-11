import { AuthGate } from "@/components/AuthGate";
import { ScheduleApp } from "@/components/ScheduleApp";

export default function Home() {
  return (
    <AuthGate>
      <ScheduleApp />
    </AuthGate>
  );
}
