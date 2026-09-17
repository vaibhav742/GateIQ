import { requireRole } from "@/lib/auth/session";
import { ActivityTimeline } from "@/components/student/ActivityTimeline";
import { PageHeader } from "@/components/layout/PageHeader";

export default async function StudentHistoryPage() {
  const { supabase, profile } = await requireRole("student");
  const { data: logs } = await supabase
    .from("entry_exit_logs")
    .select("id, action, timestamp, is_admin_override, gate:gates!entry_exit_logs_gate_id_fkey(name)")
    .eq("student_id", profile.id)
    .order("timestamp", { ascending: false })
    .limit(50);

  const events = (logs ?? []).map((log) => ({
    id: log.id,
    action: log.action,
    timestamp: log.timestamp,
    gate_name: Array.isArray(log.gate) ? log.gate[0]?.name ?? null : log.gate?.name ?? null,
    is_admin_override: log.is_admin_override,
  }));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="History" description="Your recent campus entry and exit records." />
      <ActivityTimeline
        events={events}
        emptyTitle="No movement records yet."
        emptyDescription="Campus entry and exit events will appear here."
      />
    </div>
  );
}
