import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { StudentStatusCard } from "@/components/student/StudentStatusCard";
import { ActivityTimeline } from "@/components/student/ActivityTimeline";
import { firstName, greetingForNow, campusDayBounds, formatCampusDate } from "@/lib/utils/format";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function StudentHomePage() {
  const { supabase, profile } = await requireRole("student");
  const { start, end } = campusDayBounds();

  const [{ data: status }, { data: logs }] = await Promise.all([
    supabase.rpc("get_student_campus_status", { p_student_id: profile.id }),
    supabase
      .from("entry_exit_logs")
      .select("id, action, timestamp, is_admin_override, gate:gates!entry_exit_logs_gate_id_fkey(name)")
      .eq("student_id", profile.id)
      .gte("timestamp", start)
      .lt("timestamp", end)
      .order("timestamp", { ascending: false }),
  ]);

  const events = (logs ?? []).map((log) => ({
    id: log.id,
    action: log.action,
    timestamp: log.timestamp,
    gate_name: Array.isArray(log.gate) ? log.gate[0]?.name ?? null : log.gate?.name ?? null,
    is_admin_override: log.is_admin_override,
  }));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">{formatCampusDate()}</p>
        <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">
          {greetingForNow()}, {firstName(profile.full_name)}
        </h1>
      </div>
      <StudentStatusCard
        status={status ?? "UNKNOWN"}
        lastActivityAt={events[0]?.timestamp ?? null}
        gateName={events[0]?.gate_name ?? null}
      />
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium tracking-wide uppercase">Today&apos;s activity</h2>
          <Link href="/student/history" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
            View history
          </Link>
        </div>
        <ActivityTimeline events={events} />
      </section>
    </div>
  );
}
