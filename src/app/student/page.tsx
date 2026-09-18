import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { StudentStatusCard } from "@/components/student/StudentStatusCard";
import { StudentNoticeBoard } from "@/components/student/StudentNoticeBoard";
import { ActivityTimeline } from "@/components/student/ActivityTimeline";
import { firstName, greetingForNow, campusDayBounds, formatCampusDate } from "@/lib/utils/format";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { hasIdCard } from "@/lib/registration/id-card";

export default async function StudentHomePage() {
  const { supabase, profile } = await requireRole("student");
  const { start, end } = campusDayBounds();

  const [{ data: status }, { data: logs }, { data: notices }] = await Promise.all([
    supabase.rpc("get_student_campus_status", { p_student_id: profile.id }),
    supabase
      .from("entry_exit_logs")
      .select("id, action, timestamp, is_admin_override, gate:gates!entry_exit_logs_gate_id_fkey(name)")
      .eq("student_id", profile.id)
      .gte("timestamp", start)
      .lt("timestamp", end)
      .order("timestamp", { ascending: false }),
    supabase.from("student_notices").select("*").order("created_at", { ascending: false }),
  ]);

  const events = (logs ?? []).map((log) => ({
    id: log.id,
    action: log.action,
    timestamp: log.timestamp,
    gate_name: Array.isArray(log.gate) ? log.gate[0]?.name ?? null : log.gate?.name ?? null,
    is_admin_override: log.is_admin_override,
  }));

  const visibleNotices = notices ?? [];
  const showBoard = visibleNotices.length > 0;

  const main = (
    <div className="space-y-6">
      <StudentStatusCard
        status={status ?? "UNKNOWN"}
        lastActivityAt={events[0]?.timestamp ?? null}
        gateName={events[0]?.gate_name ?? null}
      />
      {!hasIdCard(profile.id_card_path) ? (
        <Link
          href="/student/profile"
          className="block rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        >
          Photograph your campus ID from Profile as soon as you receive it. Administration can disable accounts that do
          not add one.
        </Link>
      ) : null}
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

  return (
    <div className={cn("mx-auto space-y-6", showBoard ? "max-w-6xl" : "max-w-2xl")}>
      <div>
        <p className="text-sm text-muted-foreground">{formatCampusDate()}</p>
        <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">
          {greetingForNow()}, {firstName(profile.full_name)}
        </h1>
      </div>
      {showBoard ? (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(16rem,20rem)_minmax(0,42rem)]">
          <StudentNoticeBoard notices={visibleNotices} />
          {main}
        </div>
      ) : (
        main
      )}
    </div>
  );
}
