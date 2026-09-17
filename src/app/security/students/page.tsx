import { requireRole } from "@/lib/auth/session";
import { fetchAssignedGate, fetchCampusBoard, fetchCampusSummary } from "@/services/campus";
import { GateHeader } from "@/components/security/GateHeader";
import { SecurityStudentsClient } from "@/components/security/SecurityStudentsClient";

export default async function SecurityStudentsPage() {
  const { supabase } = await requireRole("security");
  const [gate, summary, rows] = await Promise.all([
    fetchAssignedGate(supabase),
    fetchCampusSummary(supabase),
    fetchCampusBoard(supabase),
  ]);

  return (
    <div className="space-y-6">
      <GateHeader gateName={gate?.name ?? "Campus"} />
      <SecurityStudentsClient initialSummary={summary} initialRows={rows} />
    </div>
  );
}
