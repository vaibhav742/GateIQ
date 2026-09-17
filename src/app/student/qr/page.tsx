import { requireRole } from "@/lib/auth/session";
import { StudentQR } from "@/components/student/StudentQR";
import { RegenerateQrButton } from "@/components/student/RegenerateQrButton";

export default async function StudentQrPage() {
  const { supabase, profile } = await requireRole("student");
  const { data: qr } = await supabase
    .from("student_qr_codes")
    .select("token, status")
    .eq("student_id", profile.id)
    .eq("status", "active")
    .maybeSingle();

  if (!qr) {
    return (
      <div className="mx-auto max-w-md text-center">
        <h1 className="font-heading text-2xl font-semibold">QR unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          No active campus ID was found. Please contact administration.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <StudentQR
        token={qr.token}
        name={profile.full_name}
        rollNumber={profile.roll_number}
        batch={profile.batch}
        qrStatus={qr.status}
      />
      <div className="flex justify-center">
        <RegenerateQrButton />
      </div>
    </div>
  );
}
