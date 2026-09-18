import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateEntryExitCSV, type EntryExitCsvRow } from "@/lib/csv/generate-entry-exit-csv";
import { campusDayBounds, campusDateISO } from "@/lib/utils/format";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;

  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", userId)
    .maybeSingle();

  if (!profile || profile.status !== "active" || !["admin", "security"].includes(profile.role)) {
    return new Response("Forbidden", { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const start = params.get("start") ?? campusDateISO();
  const end = params.get("end") ?? start;
  const gateId = params.get("gateId");
  const action = params.get("action");
  const studentId = params.get("studentId");
  const batch = params.get("batch");
  const hostel = params.get("hostel");
  const roll = params.get("roll");

  const boundsStart = campusDayBounds(start).start;
  const boundsEnd = campusDayBounds(end).end;

  let query = supabase
    .from("entry_exit_logs")
    .select(
      "timestamp, action, verification_method, student:profiles!entry_exit_logs_student_id_fkey(full_name, roll_number, batch, hostel, role), gate:gates!entry_exit_logs_gate_id_fkey(name), recorder:profiles!entry_exit_logs_recorded_by_fkey(full_name)",
    )
    .gte("timestamp", boundsStart)
    .lt("timestamp", boundsEnd)
    .order("timestamp", { ascending: true })
    .limit(5000);

  if (gateId) query = query.eq("gate_id", gateId);
  if (action === "ENTRY" || action === "EXIT") query = query.eq("action", action);
  if (studentId) query = query.eq("student_id", studentId);

  const { data, error } = await query;
  if (error) {
    return new Response("Unable to export records.", { status: 500 });
  }

  const rows: EntryExitCsvRow[] = (data ?? [])
    .map((row) => {
      const student = Array.isArray(row.student) ? row.student[0] : row.student;
      const gate = Array.isArray(row.gate) ? row.gate[0] : row.gate;
      const recorder = Array.isArray(row.recorder) ? row.recorder[0] : row.recorder;
      return {
        timestamp: row.timestamp,
        roll_number: student?.roll_number ?? null,
        name: student?.full_name ?? "",
        role: student?.role ?? "student",
        batch: student?.batch ?? null,
        hostel: student?.hostel ?? null,
        action: row.action,
        gate: gate?.name ?? "",
        recorded_by: recorder?.full_name ?? null,
        verification_method: row.verification_method,
      };
    })
    .filter((row) => {
      if (batch && row.batch !== batch) return false;
      if (hostel && row.hostel !== hostel) return false;
      if (roll && !(row.roll_number ?? "").toLowerCase().includes(roll.toLowerCase())) return false;
      return true;
    });

  const csv = generateEntryExitCSV(rows);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="campus-access-${start}-to-${end}.csv"`,
    },
  });
}
