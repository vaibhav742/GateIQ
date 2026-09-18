import { requireRole } from "@/lib/auth/session";
import { StudentQR } from "@/components/student/StudentQR";
import { RegenerateQrButton } from "@/components/student/RegenerateQrButton";
import { formatCampusTime, isLiveStudentQr } from "@/lib/utils/format";

export default async function StudentQrPage() {
  const { supabase, profile } = await requireRole("student");
  const { data: qr } = await supabase
    .from("student_qr_codes")
    .select("token, status, expires_at")
    .eq("student_id", profile.id)
    .eq("status", "active")
    .maybeSingle();

  if (!qr || !qr.expires_at || !isLiveStudentQr(qr.expires_at, qr.status)) {
    return (
      <div className="mx-auto max-w-md text-center">
        <h1 className="font-heading text-2xl font-semibold">Generate today&apos;s QR</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your campus ID is valid until 12:00 AM. After midnight, generate a new QR here.
        </p>
        <div className="mt-6 flex justify-center">
          <RegenerateQrButton mode="generate" />
        </div>
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
        validUntil={formatCampusTime(qr.expires_at)}
      />
      <div className="mx-auto max-w-md space-y-2 text-center">
        <p className="text-sm text-muted-foreground">
          Use Regenerate if this QR was shared, screenshotted, or your phone was lost.
        </p>
        <div className="flex justify-center">
          <RegenerateQrButton />
        </div>
      </div>
    </div>
  );
}
