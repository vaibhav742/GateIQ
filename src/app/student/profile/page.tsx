import { requireRole } from "@/lib/auth/session";
import { PageHeader } from "@/components/layout/PageHeader";
import { CampusStatusBadge } from "@/components/status/CampusStatusBadge";

export default async function StudentProfilePage() {
  const { supabase, profile } = await requireRole("student");
  const { data: status } = await supabase.rpc("get_student_campus_status", {
    p_student_id: profile.id,
  });

  const fields = [
    ["Name", profile.full_name],
    ["Roll number", profile.roll_number],
    ["Email", profile.email],
    ["Batch", profile.batch],
    ["Section", profile.section],
    ["Phone", profile.phone],
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Profile" description="Your campus identity details." />
      <div className="rounded-2xl border border-border/80 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Campus status</p>
          <CampusStatusBadge status={status ?? "UNKNOWN"} />
        </div>
        <dl className="grid gap-4 sm:grid-cols-2">
          {fields.map(([label, value]) => (
            <div key={label}>
              <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</dt>
              <dd className="mt-1 text-sm font-medium">{value || "—"}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
