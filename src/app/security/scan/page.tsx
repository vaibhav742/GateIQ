import { requireRole } from "@/lib/auth/session";
import { fetchAssignedGate } from "@/services/campus";
import { ScanExperience } from "@/components/security/ScanExperience";
import { GateHeader } from "@/components/security/GateHeader";

export default async function SecurityScanPage() {
  const { supabase } = await requireRole("security");
  const gate = await fetchAssignedGate(supabase);

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <GateHeader gateName={gate?.name ?? "No gate assigned"} />
      {gate ? (
        <ScanExperience gateName={gate.name} />
      ) : (
        <p className="text-sm text-muted-foreground">
          You need an active gate assignment before you can record entry and exit.
        </p>
      )}
    </div>
  );
}
