import { formatCount } from "@/lib/utils/format";
import { StatCard } from "@/components/admin/StatCard";
import type { CampusSummary } from "@/types/database";

export function CampusStatusSummary({ summary }: { summary: CampusSummary }) {
  return (
    <div className="@container">
      <div className="grid grid-cols-2 gap-3 [&>*:last-child]:col-span-2 @min-[840px]:grid-cols-5 @min-[840px]:[&>*:last-child]:col-span-1">
        <StatCard label="Total students" value={formatCount(summary.total_students)} />
        <StatCard label="Inside" value={formatCount(summary.inside)} />
        <StatCard label="Outside" value={formatCount(summary.outside)} />
        <StatCard label="Today's entries" value={formatCount(summary.entries_today)} />
        <StatCard label="Today's exits" value={formatCount(summary.exits_today)} />
      </div>
    </div>
  );
}
