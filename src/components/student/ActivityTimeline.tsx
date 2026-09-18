import { formatCampusTime } from "@/lib/utils/format";
import { EmptyState } from "@/components/layout/EmptyState";
import { verificationMethodLabel } from "@/lib/registration/format";

export type TimelineEvent = {
  id: string;
  action: string;
  timestamp: string;
  gate_name: string | null;
  is_admin_override: boolean;
  verification_method?: string | null;
};

export function ActivityTimeline({
  events,
  emptyTitle = "No activity yet today.",
  emptyDescription = "Entry and exit events will appear here.",
}: {
  events: TimelineEvent[];
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (events.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <ol className="space-y-3">
      {events.map((event) => (
        <li
          key={event.id}
          className="flex items-start justify-between gap-4 rounded-xl border border-border/70 bg-white px-4 py-3"
        >
          <div>
            <p className="text-sm font-medium tracking-wide">{event.action}</p>
            <p className="text-sm text-muted-foreground">{event.gate_name ?? "Unknown gate"}</p>
            {event.is_admin_override ? (
              <p className="mt-1 text-[11px] font-medium tracking-wide text-amber-700 uppercase">
                Admin override
              </p>
            ) : event.verification_method && event.verification_method !== "QR" ? (
              <p className="mt-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                {verificationMethodLabel(event.verification_method)}
              </p>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">{formatCampusTime(event.timestamp)}</p>
        </li>
      ))}
    </ol>
  );
}
