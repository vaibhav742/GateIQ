import { requireRole } from "@/lib/auth/session";
import { PageHeader } from "@/components/layout/PageHeader";
import { RegistrationManager } from "@/components/admin/RegistrationManager";

export default async function AdminRegistrationPage() {
  const { supabase } = await requireRole("admin");
  const [{ data: batches }, { data: forms }, { data: students }, { data: hostels }] = await Promise.all([
    supabase.from("batches").select("*").order("batch_number", { ascending: false }),
    supabase.from("registration_forms").select("*"),
    supabase.from("profiles").select("*").eq("role", "student").order("roll_number"),
    supabase.from("hostels").select("*").order("name"),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Registration"
        description="Configure batch onboarding forms, share the public URL, and review student registrations."
      />
      <RegistrationManager
        batches={batches ?? []}
        forms={forms ?? []}
        students={students ?? []}
        hostels={hostels ?? []}
      />
    </div>
  );
}
