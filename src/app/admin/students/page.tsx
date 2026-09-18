import { requireRole } from "@/lib/auth/session";
import { PageHeader } from "@/components/layout/PageHeader";
import { AdminStudentsClient } from "@/components/admin/AdminStudentsClient";

export default async function AdminStudentsPage() {
  const { supabase } = await requireRole("admin");
  const [{ data: students }, { data: qrs }, { data: hostels }] = await Promise.all([
    supabase.from("profiles").select("*").eq("role", "student").order("roll_number"),
    supabase.from("student_qr_codes").select("student_id, status").eq("status", "active"),
    supabase.from("hostels").select("*").order("name"),
  ]);

  const qrMap = new Map((qrs ?? []).map((row) => [row.student_id, row.status]));
  const rows = (students ?? []).map((student) => ({
    ...student,
    qr_status: qrMap.get(student.id) ?? "revoked",
  }));

  return (
    <div className="space-y-6">
      <PageHeader title="Students" description="Create, update, and deactivate campus identities." />
      <AdminStudentsClient students={rows} hostels={hostels ?? []} />
    </div>
  );
}
