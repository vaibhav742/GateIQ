import { requireRole } from "@/lib/auth/session";
import { PageHeader } from "@/components/layout/PageHeader";
import { CAMPUS } from "@/config/campus";

export default async function AdminSettingsPage() {
  await requireRole("admin");

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Campus configuration for this deployment." />
      <div className="rounded-xl border border-border/80 bg-white p-5">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">Institution</dt>
            <dd className="mt-1 font-medium">{CAMPUS.name}</dd>
          </div>
          <div>
            <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">Product</dt>
            <dd className="mt-1 font-medium">{CAMPUS.product}</dd>
          </div>
          <div>
            <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">Timezone</dt>
            <dd className="mt-1 font-medium">{CAMPUS.timezone}</dd>
          </div>
          <div>
            <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">QR payload</dt>
            <dd className="mt-1 font-medium">{CAMPUS.qrPrefix}[token]</dd>
          </div>
        </dl>
        <p className="mt-6 text-sm text-muted-foreground">
          Presence is always derived from the latest valid movement of the current campus day.
          Roles are stored in the database, not in client-editable metadata.
        </p>
      </div>
    </div>
  );
}
