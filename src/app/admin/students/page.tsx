import { requireRole } from "@/lib/auth/session";
import { PageHeader } from "@/components/layout/PageHeader";
import { AdminStudentsClient } from "@/components/admin/AdminStudentsClient";
import { StudentNoticeManager } from "@/components/admin/StudentNoticeManager";
import { hasIdCard } from "@/lib/registration/id-card";

export default async function AdminStudentsPage() {
  const { supabase } = await requireRole("admin");
  const [{ data: students }, { data: qrs }, { data: hostels }, { data: notices }] = await Promise.all([
    supabase.from("profiles").select("*").eq("role", "student").order("roll_number"),
    supabase.from("student_qr_codes").select("student_id, status").eq("status", "active"),
    supabase.from("hostels").select("*").order("name"),
    supabase.from("student_notices").select("*").order("created_at", { ascending: false }),
  ]);

  const qrMap = new Map((qrs ?? []).map((row) => [row.student_id, row.status]));
  const rows = (students ?? []).map((student) => ({
    ...student,
    qr_status: qrMap.get(student.id) ?? "revoked",
  }));
  const missingIdCount = rows.filter((student) => !hasIdCard(student.id_card_path)).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Students"
        description="Create, update, and disable campus identities. Filter who has photographed their ID."
      />
      <StudentNoticeManager notices={notices ?? []} missingIdCount={missingIdCount} />
      <AdminStudentsClient students={rows} hostels={hostels ?? []} />
    </div>
  );
}
