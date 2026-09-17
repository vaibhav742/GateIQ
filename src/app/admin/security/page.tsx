import { requireRole } from "@/lib/auth/session";
import { PageHeader } from "@/components/layout/PageHeader";
import { AdminSecurityClient } from "@/components/admin/AdminSecurityClient";

export default async function AdminSecurityPage() {
  const { supabase } = await requireRole("admin");
  const [{ data: people }, { data: gates }, { data: assignments }] = await Promise.all([
    supabase.from("profiles").select("*").eq("role", "security").order("full_name"),
    supabase.from("gates").select("*").order("name"),
    supabase.from("security_gate_assignments").select("security_user_id, gate_id, active").eq("active", true),
  ]);

  const assignmentMap = new Map((assignments ?? []).map((row) => [row.security_user_id, row.gate_id]));
  const gateMap = new Map((gates ?? []).map((gate) => [gate.id, gate.name]));

  const rows = (people ?? []).map((person) => ({
    ...person,
    gate_id: assignmentMap.get(person.id) ?? null,
    gate_name: gateMap.get(assignmentMap.get(person.id) ?? "") ?? null,
  }));

  return (
    <div className="space-y-6">
      <PageHeader title="Security" description="Assign guards to gates without giving them admin access." />
      <AdminSecurityClient people={rows} gates={gates ?? []} />
    </div>
  );
}
