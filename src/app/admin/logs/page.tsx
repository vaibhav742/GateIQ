import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/layout/EmptyState";
import { formatCampusDateTime } from "@/lib/utils/format";
import { verificationMethodLabel } from "@/lib/registration/format";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, nativeSelectClass } from "@/lib/utils";
import { campusDateISO } from "@/lib/utils/format";

const PAGE_SIZE = 25;

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase } = await requireRole("admin");
  const params = await searchParams;
  const value = (key: string) => {
    const raw = params[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };

  const start = value("start") ?? campusDateISO();
  const end = value("end") ?? start;
  const action = value("action") ?? "";
  const gateId = value("gate") ?? "";
  const batch = value("batch") ?? "";
  const search = value("q") ?? "";
  const page = Math.max(1, Number(value("page") ?? "1"));
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const [{ data: gates }, { data: batchRows }, logsResult] = await Promise.all([
    supabase.from("gates").select("id, name").order("name"),
    supabase.from("batches").select("batch_number").order("batch_number", { ascending: false }),
    (async () => {
      let query = supabase
        .from("entry_exit_logs")
        .select(
          "id, timestamp, action, verification_method, is_admin_override, remarks, student:profiles!entry_exit_logs_student_id_fkey(full_name, roll_number, batch, section), gate:gates!entry_exit_logs_gate_id_fkey(name), recorder:profiles!entry_exit_logs_recorded_by_fkey(full_name)",
          { count: "exact" },
        )
        .gte("timestamp", `${start}T00:00:00+05:30`)
        .lt("timestamp", `${end}T23:59:59.999+05:30`)
        .order("timestamp", { ascending: false })
        .range(from, to);

      if (action === "ENTRY" || action === "EXIT") query = query.eq("action", action);
      if (gateId) query = query.eq("gate_id", gateId);
      return query;
    })(),
  ]);

  const rows = (logsResult.data ?? []).filter((row) => {
    const student = Array.isArray(row.student) ? row.student[0] : row.student;
    if (search) {
      const haystack = `${student?.full_name ?? ""} ${student?.roll_number ?? ""}`.toLowerCase();
      if (!haystack.includes(search.toLowerCase())) return false;
    }
    if (batch && student?.batch !== batch) return false;
    return true;
  });

  const total = logsResult.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const exportHref = `/api/export/logs?start=${start}&end=${end}${gateId ? `&gateId=${gateId}` : ""}${action ? `&action=${action}` : ""}${search ? `&roll=${search}` : ""}${batch ? `&batch=${batch}` : ""}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Entry / exit logs"
        description="Historical events are immutable. Corrections appear as marked override records."
        actions={
          <a href={exportHref} className={cn(buttonVariants())}>
            Export CSV
          </a>
        }
      />

      <form className="grid gap-3 rounded-xl border border-border/80 bg-white p-4 sm:grid-cols-2 xl:grid-cols-6">
        <Input type="date" name="start" defaultValue={start} aria-label="Start date" className="h-10" />
        <Input type="date" name="end" defaultValue={end} aria-label="End date" className="h-10" />
        <select name="gate" defaultValue={gateId} className={nativeSelectClass} aria-label="Gate">
          <option value="">All gates</option>
          {(gates ?? []).map((gate) => (
            <option key={gate.id} value={gate.id}>
              {gate.name}
            </option>
          ))}
        </select>
        <select name="action" defaultValue={action} className={nativeSelectClass} aria-label="Action">
          <option value="">All actions</option>
          <option value="ENTRY">ENTRY</option>
          <option value="EXIT">EXIT</option>
        </select>
        <select name="batch" defaultValue={batch} className={nativeSelectClass} aria-label="Batch">
          <option value="">All batches</option>
          {(batchRows ?? []).map((item) => (
            <option key={item.batch_number} value={item.batch_number}>
              Batch {item.batch_number}
            </option>
          ))}
        </select>
        <div className="flex min-w-0 gap-2 sm:col-span-2 xl:col-span-1">
          <Input name="q" defaultValue={search} placeholder="Student or roll no." className="h-10 min-w-0 flex-1" />
          <button className={cn(buttonVariants({ variant: "outline" }), "h-10 shrink-0")} type="submit">
            Filter
          </button>
        </div>
      </form>

      {rows.length === 0 ? (
        <EmptyState title="No records found." description="Try a different date range or filter." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/80 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b bg-muted/40 text-[11px] tracking-wide text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Roll Number</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Gate</th>
                  <th className="px-4 py-3">Recorded By</th>
                  <th className="px-4 py-3">Verification</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const student = Array.isArray(row.student) ? row.student[0] : row.student;
                  const gate = Array.isArray(row.gate) ? row.gate[0] : row.gate;
                  const recorder = Array.isArray(row.recorder) ? row.recorder[0] : row.recorder;
                  return (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="px-4 py-3 whitespace-nowrap">{formatCampusDateTime(row.timestamp)}</td>
                      <td className="px-4 py-3">{student?.full_name}</td>
                      <td className="px-4 py-3">{student?.roll_number ?? "—"}</td>
                      <td className="px-4 py-3">
                        {row.action}
                        {row.is_admin_override ? (
                          <span className="ml-2 text-[10px] font-semibold tracking-wide text-amber-700 uppercase">
                            Override
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">{gate?.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{recorder?.full_name ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {verificationMethodLabel(row.verification_method)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <p>
          Page {page} of {totalPages}
        </p>
        <div className="flex gap-2">
          {page > 1 ? (
            <Link
              href={`/admin/logs?start=${start}&end=${end}&gate=${gateId}&action=${action}&batch=${batch}&q=${search}&page=${page - 1}`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Previous
            </Link>
          ) : null}
          {page < totalPages ? (
            <Link
              href={`/admin/logs?start=${start}&end=${end}&gate=${gateId}&action=${action}&batch=${batch}&q=${search}&page=${page + 1}`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Next
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
