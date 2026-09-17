import type { Profile } from "@/types/database";
import type { UserRole } from "@/config/campus";
import { mobileNavForRole, navForRole } from "@/config/nav";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";

export function AppShell({
  profile,
  context,
  children,
}: {
  profile: Profile;
  context?: string;
  children: React.ReactNode;
}) {
  const role = profile.role as UserRole;
  const items = navForRole(role);
  const mobileItems = mobileNavForRole(role);

  return (
    <div className="flex min-h-svh bg-[oklch(0.975_0.006_90)]">
      <Sidebar items={items} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header profile={profile} items={items} context={context} />
        <main className="flex-1 px-4 py-6 pb-24 md:px-8 md:pb-8">{children}</main>
      </div>
      <MobileNav items={mobileItems} />
    </div>
  );
}
