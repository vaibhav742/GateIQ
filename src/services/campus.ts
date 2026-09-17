import type { CampusSummary, CampusBoardRow } from "@/types/database";
import type { Json } from "@/types/database";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

function asSummary(value: Json | null): CampusSummary {
  const record = (value ?? {}) as Record<string, unknown>;
  return {
    day: String(record.day ?? ""),
    total_students: Number(record.total_students ?? 0),
    inside: Number(record.inside ?? 0),
    outside: Number(record.outside ?? 0),
    unknown: Number(record.unknown ?? 0),
    entries_today: Number(record.entries_today ?? 0),
    exits_today: Number(record.exits_today ?? 0),
  };
}

export async function fetchCampusSummary(supabase: Supabase, day?: string) {
  const { data, error } = await supabase.rpc("get_campus_summary", {
    p_day: day,
  });

  if (error) {
    throw new Error("Unable to load campus summary.");
  }

  return asSummary(data);
}

export async function fetchCampusBoard(
  supabase: Supabase,
  options?: { day?: string; status?: string; search?: string; batch?: string },
) {
  const { data, error } = await supabase.rpc("get_campus_status_board", {
    p_day: options?.day,
    p_status: options?.status ?? "ALL",
    p_search: options?.search || undefined,
    p_batch: options?.batch || undefined,
  });

  if (error) {
    throw new Error("Unable to load student status.");
  }

  return (data ?? []) as CampusBoardRow[];
}

export async function fetchAssignedGate(supabase: Supabase) {
  const { data, error } = await supabase.rpc("get_my_assigned_gate");
  if (error) {
    return null;
  }

  const payload = data as {
    success?: boolean;
    gate?: { id: string; name: string; location: string | null; status: string };
  } | null;

  if (!payload?.success || !payload.gate) {
    return null;
  }

  return payload.gate;
}
