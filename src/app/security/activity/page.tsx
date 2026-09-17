import { requireRole } from "@/lib/auth/session";
import { fetchAssignedGate } from "@/services/campus";
import { GateHeader } from "@/components/security/GateHeader";
import { ActivityTimeline } from "@/components/student/ActivityTimeline";
import { campusDayBounds } from "@/lib/utils/format";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { campusDateISO } from "@/lib/utils/format";

export default async function SecurityActivityPage() {
  const { supabase } = await requireRole("security");
  const gate = await fetchAssignedGate(supabase);
  const { start, end } = campusDayBounds();

  const { data: logs } = await supabase
    .from("entry_exit_logs")
    .select(
      "id, action, timestamp, is_admin_override, student:profiles!entry_exit_logs_student_id_fkey(full_name), gate:gates!entry_exit_logs_gate_id_fkey(name)",
    )
    .gte("timestamp", start)
    .lt("timestamp", end)
    .order("timestamp", { ascending: false })
    .limit(100);

  const events = (logs ?? []).map((log) => {
    const student = Array.isArray(log.student) ? log.student[0] : log.student;
    const gateRow = Array.isArray(log.gate) ? log.gate[0] : log.gate;
    return {
      id: log.id,
      action: `${log.action} · ${student?.full_name ?? "Student"}`,
      timestamp: log.timestamp,
      gate_name: gateRow?.name ?? null,
      is_admin_override: log.is_admin_override,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <GateHeader gateName={gate?.name ?? "Campus"} />
        <a
          href={`/api/export/logs?start=${campusDateISO()}&end=${campusDateISO()}`}
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Export today
        </a>
      </div>
      <ActivityTimeline events={events} />
    </div>
  );
}
