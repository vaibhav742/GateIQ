import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { fetchAssignedGate, fetchCampusSummary } from "@/services/campus";
import { CampusStatusSummary } from "@/components/security/CampusStatusSummary";
import { GateHeader } from "@/components/security/GateHeader";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function SecurityHomePage() {
  const { supabase } = await requireRole("security");
  const [gate, summary] = await Promise.all([
    fetchAssignedGate(supabase),
    fetchCampusSummary(supabase),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <GateHeader gateName={gate?.name ?? "No gate assigned"} />
      <Link
        href="/security/scan"
        className={cn(buttonVariants({ size: "lg" }), "h-14 w-full text-base")}
      >
        Scan QR
      </Link>
      <div>
        <h2 className="mb-3 text-sm font-medium tracking-wide uppercase">Today&apos;s status</h2>
        <CampusStatusSummary summary={summary} />
      </div>
      <Link href="/security/students" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 w-full")}>
        View students
      </Link>
    </div>
  );
}
