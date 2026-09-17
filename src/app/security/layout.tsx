import { AppShell } from "@/components/layout/AppShell";
import { requireRole } from "@/lib/auth/session";
import { fetchAssignedGate } from "@/services/campus";

export default async function SecurityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { supabase, profile } = await requireRole("security");
  const gate = await fetchAssignedGate(supabase);
  return (
    <AppShell profile={profile} context={gate?.name ?? "Unassigned gate"}>
      {children}
    </AppShell>
  );
}
