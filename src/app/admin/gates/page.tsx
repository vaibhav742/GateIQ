import { requireRole } from "@/lib/auth/session";
import { PageHeader } from "@/components/layout/PageHeader";
import { AdminGatesClient } from "@/components/admin/AdminGatesClient";

export default async function AdminGatesPage() {
  const { supabase } = await requireRole("admin");
  const { data: gates } = await supabase.from("gates").select("*").order("name");

  return (
    <div className="space-y-6">
      <PageHeader title="Gates" description="Campus gates are stored in the database and never hard-coded." />
      <AdminGatesClient gates={gates ?? []} />
    </div>
  );
}
