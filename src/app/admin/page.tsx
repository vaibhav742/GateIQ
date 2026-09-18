import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { fetchCampusSummary } from "@/services/campus";
import { CampusStatusSummary } from "@/components/security/CampusStatusSummary";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatCampusTime, campusDateISO } from "@/lib/utils/format";
import { EmptyState } from "@/components/layout/EmptyState";
import { MovementActionBadge } from "@/components/status/CampusStatusBadge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { verificationMethodLabel } from "@/lib/registration/format";

export default async function AdminDashboardPage() {
  const { supabase } = await requireRole("admin");
  const summary = await fetchCampusSummary(supabase);

  const { data: logs } = await supabase
    .from("entry_exit_logs")
    .select(
      "id, timestamp, action, is_admin_override, verification_method, student:profiles!entry_exit_logs_student_id_fkey(full_name), gate:gates!entry_exit_logs_gate_id_fkey(name)",
    )
    .order("timestamp", { ascending: false })
    .limit(12);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campus overview"
        description="Live presence is derived from each student's latest valid movement today."
        actions={
          <Link
            href={`/api/export/logs?start=${campusDateISO()}&end=${campusDateISO()}`}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Export today
          </Link>
        }
      />
      <CampusStatusSummary summary={summary} />
      <section>
        <h2 className="mb-3 text-sm font-medium tracking-wide uppercase">Recent activity</h2>
        {logs?.length ? (
          <div className="overflow-hidden rounded-xl border border-border/80 bg-white">
            <ul>
              {logs.map((log) => {
                const student = Array.isArray(log.student) ? log.student[0] : log.student;
                const gate = Array.isArray(log.gate) ? log.gate[0] : log.gate;
                return (
                  <li
                    key={log.id}
                    className="flex items-center justify-between gap-4 border-b border-border/70 px-4 py-3 last:border-0"
                  >
                    <div>
                      <p className="text-sm font-medium">{student?.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {gate?.name}
                        {log.is_admin_override
                          ? " · Override"
                          : log.verification_method && log.verification_method !== "QR"
                            ? ` · ${verificationMethodLabel(log.verification_method)}`
                            : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <MovementActionBadge action={log.action} />
                      <p className="mt-1 text-xs text-muted-foreground">{formatCampusTime(log.timestamp)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <EmptyState title="No activity yet today." description="Entry and exit events will appear here." />
        )}
      </section>
    </div>
  );
}
