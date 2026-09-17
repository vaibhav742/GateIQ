"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CampusStatusSummary } from "@/components/security/CampusStatusSummary";
import { StudentStatusTable } from "@/components/security/StudentStatusTable";
import { Input } from "@/components/ui/input";
import { cn, nativeSelectClass } from "@/lib/utils";
import type { CampusBoardRow, CampusSummary } from "@/types/database";

const FILTERS = ["ALL", "INSIDE", "OUTSIDE"] as const;

export function SecurityStudentsClient({
  initialSummary,
  initialRows,
}: {
  initialSummary: CampusSummary;
  initialRows: CampusBoardRow[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("ALL");
  const [query, setQuery] = useState("");
  const [batchFilter, setBatchFilter] = useState("all");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("security-students")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "entry_exit_logs" },
        () => startTransition(() => router.refresh()),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router]);

  const batches = useMemo(
    () => Array.from(new Set(initialRows.map((row) => row.batch).filter(Boolean))) as string[],
    [initialRows],
  );

  const rows = useMemo(() => {
    const search = query.trim().toLowerCase();
    return initialRows.filter((row) => {
      const statusOk = filter === "ALL" || row.campus_status === filter;
      const batchOk = batchFilter === "all" || row.batch === batchFilter;
      const searchOk =
        !search ||
        row.full_name.toLowerCase().includes(search) ||
        (row.roll_number ?? "").toLowerCase().includes(search);
      return statusOk && batchOk && searchOk;
    });
  }, [batchFilter, filter, initialRows, query]);

  return (
    <div className="space-y-5">
      <CampusStatusSummary summary={initialSummary} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex rounded-lg bg-muted p-1">
          {FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium",
                filter === item ? "bg-white text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              {item}
            </button>
          ))}
        </div>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search student..."
          aria-label="Search student"
          className="h-10 sm:max-w-xs"
        />
        <select
          value={batchFilter}
          onChange={(event) => setBatchFilter(event.target.value)}
          className={cn(nativeSelectClass, "sm:w-40")}
          aria-label="Batch"
        >
          <option value="all">All batches</option>
          {batches.map((batch) => (
            <option key={batch} value={batch}>
              Batch {batch}
            </option>
          ))}
        </select>
      </div>
      <div className={isPending ? "opacity-70" : ""}>
        <StudentStatusTable rows={rows} />
      </div>
    </div>
  );
}
