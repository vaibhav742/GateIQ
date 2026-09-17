import { cn } from "@/lib/utils";
import type { CampusStatus, MovementAction } from "@/config/campus";

const styles: Record<CampusStatus, string> = {
  INSIDE: "border-emerald-200 bg-emerald-50 text-emerald-800",
  OUTSIDE: "border-slate-200 bg-slate-100 text-slate-700",
  UNKNOWN: "border-border bg-muted text-muted-foreground",
};

const actionStyles: Record<MovementAction, string> = {
  ENTRY: "border-emerald-200 bg-emerald-50 text-emerald-800",
  EXIT: "border-slate-200 bg-slate-100 text-slate-700",
};

export function CampusStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const key = (status as CampusStatus) in styles ? (status as CampusStatus) : "UNKNOWN";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase",
        styles[key],
        className,
      )}
    >
      {key}
    </span>
  );
}

export function MovementActionBadge({ action }: { action: string }) {
  const key = action === "EXIT" ? "EXIT" : "ENTRY";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase",
        actionStyles[key],
      )}
    >
      {key}
    </span>
  );
}

export function AccountStatusBadge({ status }: { status: string }) {
  const tone =
    status === "active" || status === "approved"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : status === "pending"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-border bg-muted text-muted-foreground";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase",
        tone,
      )}
    >
      {status}
    </span>
  );
}
