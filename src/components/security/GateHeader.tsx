import { formatCampusDate } from "@/lib/utils/format";

export function GateHeader({
  gateName,
  date,
}: {
  gateName: string;
  date?: string | Date;
}) {
  return (
    <div>
      <p className="text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
        Assigned gate
      </p>
      <h1 className="mt-1 font-heading text-2xl font-semibold tracking-tight">{gateName}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{formatCampusDate(date)}</p>
    </div>
  );
}
