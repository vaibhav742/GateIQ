import { requireRole } from "@/lib/auth/session";
import { PageHeader } from "@/components/layout/PageHeader";
import { campusDateISO } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { nativeSelectClass } from "@/lib/utils";
import { adminOverrideAction } from "@/lib/admin/actions";

export default async function AdminReportsPage() {
  const { supabase } = await requireRole("admin");
  const today = campusDateISO();
  const [{ data: gates }, { data: students }, { data: batches }] = await Promise.all([
    supabase.from("gates").select("id, name").eq("status", "active").order("name"),
    supabase.from("profiles").select("id, full_name, roll_number").eq("role", "student").eq("status", "active").order("roll_number"),
    supabase.from("batches").select("batch_number").order("batch_number", { ascending: false }),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader title="Reports" description="Export filtered movement records or record a visible admin correction." />

      <section className="rounded-xl border border-border/80 bg-white p-5">
        <h2 className="font-medium">CSV export</h2>
        <form className="mt-4 grid gap-4 md:grid-cols-3" action="/api/export/logs" method="GET">
          <div className="space-y-1.5">
            <Label htmlFor="start">From</Label>
            <Input id="start" name="start" type="date" defaultValue={today} className="h-10" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="end">To</Label>
            <Input id="end" name="end" type="date" defaultValue={today} className="h-10" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gateId">Gate</Label>
            <select id="gateId" name="gateId" className={nativeSelectClass}>
              <option value="">All gates</option>
              {(gates ?? []).map((gate) => (
                <option key={gate.id} value={gate.id}>
                  {gate.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="batch">Batch</Label>
            <select id="batch" name="batch" className={nativeSelectClass}>
              <option value="">All batches</option>
              {(batches ?? []).map((item) => (
                <option key={item.batch_number} value={item.batch_number}>
                  Batch {item.batch_number}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="action">Action</Label>
            <select id="action" name="action" className={nativeSelectClass}>
              <option value="">All</option>
              <option value="ENTRY">ENTRY</option>
              <option value="EXIT">EXIT</option>
            </select>
          </div>
          <div className="flex items-end">
            <Button type="submit">Export CSV</Button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-border/80 bg-white p-5">
        <h2 className="font-medium">Admin override</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This creates a new audit record. Historical events are never rewritten.
        </p>
        <form action={adminOverrideAction} className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="student_id">Student</Label>
            <select id="student_id" name="student_id" required className={nativeSelectClass}>
              <option value="">Select student</option>
              {(students ?? []).map((student) => (
                <option key={student.id} value={student.id}>
                  {student.roll_number} · {student.full_name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gate_id">Gate</Label>
            <select id="gate_id" name="gate_id" required className={nativeSelectClass}>
              {(gates ?? []).map((gate) => (
                <option key={gate.id} value={gate.id}>
                  {gate.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="action">Action</Label>
            <select id="action" name="action" required className={nativeSelectClass}>
              <option value="ENTRY">ENTRY</option>
              <option value="EXIT">EXIT</option>
            </select>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="remarks">Remarks</Label>
            <Input id="remarks" name="remarks" required placeholder="Reason for correction" />
          </div>
          <div>
            <Button type="submit">Record override</Button>
          </div>
        </form>
      </section>
    </div>
  );
}
