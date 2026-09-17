import { AppShell } from "@/components/layout/AppShell";
import { requireRole } from "@/lib/auth/session";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireRole("admin");
  return (
    <AppShell profile={profile} context="Administration">
      {children}
    </AppShell>
  );
}
