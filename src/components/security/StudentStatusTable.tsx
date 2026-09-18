import { CampusStatusBadge } from "@/components/status/CampusStatusBadge";
import { EmptyState } from "@/components/layout/EmptyState";
import { formatCampusTime } from "@/lib/utils/format";
import type { CampusBoardRow } from "@/types/database";

export function StudentStatusTable({ rows }: { rows: CampusBoardRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No students found."
        description="Try a different name or roll number."
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border/80 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border/80 bg-muted/40 text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-3">Roll Number</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Batch</th>
              <th className="px-4 py-3">Hostel</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Last Action</th>
              <th className="px-4 py-3">Last Gate</th>
              <th className="px-4 py-3">Last Activity</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.student_id} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-3 font-medium">{row.roll_number ?? "—"}</td>
                <td className="px-4 py-3">{row.full_name}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.batch ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.hostel ?? "—"}</td>
                <td className="px-4 py-3">
                  <CampusStatusBadge status={row.campus_status} />
                </td>
                <td className="px-4 py-3">{row.last_action ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.last_gate_name ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {row.last_activity ? formatCampusTime(row.last_activity) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
