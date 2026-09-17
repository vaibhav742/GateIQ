import { AppShell } from "@/components/layout/AppShell";
import { requireRole } from "@/lib/auth/session";

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireRole("student");
  return (
    <AppShell profile={profile} context={profile.roll_number ?? "Student"}>
      {children}
    </AppShell>
  );
}
