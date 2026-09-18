import { requireRole } from "@/lib/auth/session";
import { PageHeader } from "@/components/layout/PageHeader";
import { AdminSecurityClient } from "@/components/admin/AdminSecurityClient";

export default async function AdminSecurityPage() {
  const { supabase } = await requireRole("admin");
  const [{ data: people }, { data: gates }, { data: assignments }, { data: guards }] = await Promise.all([
    supabase.from("profiles").select("*").eq("role", "security").order("full_name"),
    supabase.from("gates").select("*").order("name"),
    supabase.from("security_gate_assignments").select("security_user_id, gate_id, active").eq("active", true),
    supabase.from("security_shift_guards").select("*").order("full_name"),
  ]);

  const assignmentMap = new Map((assignments ?? []).map((row) => [row.security_user_id, row.gate_id]));
  const gateMap = new Map((gates ?? []).map((gate) => [gate.id, gate.name]));
  const guardsByUser = new Map<string, NonNullable<typeof guards>>();

  for (const guard of guards ?? []) {
    const list = guardsByUser.get(guard.security_user_id) ?? [];
    list.push(guard);
    guardsByUser.set(guard.security_user_id, list);
  }

  const rows = (people ?? []).map((person) => ({
    ...person,
    gate_id: assignmentMap.get(person.id) ?? null,
    gate_name: gateMap.get(assignmentMap.get(person.id) ?? "") ?? null,
    guards: guardsByUser.get(person.id) ?? [],
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Security"
        description="Create a shared login for each shift, add the guards on duty, and assign their gate."
      />
      <AdminSecurityClient people={rows} gates={gates ?? []} />
    </div>
  );
}
