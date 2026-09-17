import Link from "next/link";
import { CampusStatusBadge } from "@/components/status/CampusStatusBadge";
import { buttonVariants } from "@/components/ui/button";
import { formatCampusTime } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

export function StudentStatusCard({
  status,
  lastActivityAt,
  gateName,
}: {
  status: string;
  lastActivityAt: string | null;
  gateName: string | null;
}) {
  return (
    <section className="rounded-2xl border border-border/80 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <p className="text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
        Current campus status
      </p>
      <div className="mt-3 flex items-center gap-3">
        <span
          className={
            status === "INSIDE"
              ? "size-2.5 rounded-full bg-emerald-500"
              : status === "OUTSIDE"
                ? "size-2.5 rounded-full bg-slate-400"
                : "size-2.5 rounded-full bg-zinc-300"
          }
        />
        <CampusStatusBadge status={status} className="text-xs" />
      </div>
      <div className="mt-4 space-y-1 text-sm text-muted-foreground">
        {lastActivityAt ? (
          <>
            <p>
              {status === "INSIDE" ? "Entered" : "Last activity"}{" "}
              <span className="font-medium text-foreground">{formatCampusTime(lastActivityAt)}</span>
            </p>
            {gateName ? <p>{gateName}</p> : null}
          </>
        ) : (
          <p>No campus movement recorded today.</p>
        )}
      </div>
      <Link
        href="/student/qr"
        className={cn(buttonVariants({ size: "lg" }), "mt-5 h-11 w-full")}
      >
        View my QR
      </Link>
    </section>
  );
}
