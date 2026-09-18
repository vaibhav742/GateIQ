import { requireRole } from "@/lib/auth/session";
import { PageHeader } from "@/components/layout/PageHeader";
import { AdminGatesClient } from "@/components/admin/AdminGatesClient";

export default async function AdminGatesPage() {
  const { supabase } = await requireRole("admin");
  const { data: gates } = await supabase.from("gates").select("*").order("name");

  return (
    <div className="space-y-6">
      <PageHeader title="Gates" description="Add campus gates and remove unused ones. Gates with scan history can be deactivated instead." />
      <AdminGatesClient gates={gates ?? []} />
    </div>
  );
}
