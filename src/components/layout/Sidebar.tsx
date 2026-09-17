"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CAMPUS } from "@/config/campus";
import type { NavItem } from "@/config/nav";
import { NavIcon } from "@/components/layout/NavIcon";
import { cn } from "@/lib/utils";

export function Sidebar({
  items,
  variant = "desktop",
}: {
  items: NavItem[];
  variant?: "desktop" | "drawer";
}) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "w-[240px] shrink-0 border-r border-border/80 bg-[var(--sidebar)] flex-col",
        variant === "desktop" ? "hidden md:sticky md:top-0 md:flex md:h-svh" : "flex h-full",
      )}
    >
      <div className="flex h-14 items-center gap-2.5 px-5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-[11px] font-semibold tracking-wide text-primary-foreground">
          CA
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight">{CAMPUS.product}</p>
          <p className="truncate text-[11px] text-muted-foreground">{CAMPUS.name}</p>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 p-3">
        {items.map((item) => {
          const home = item.href === "/student" || item.href === "/security" || item.href === "/admin";
          const active = home ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-white text-foreground shadow-sm ring-1 ring-border/70"
                  : "text-muted-foreground hover:bg-white/70 hover:text-foreground",
              )}
            >
              <NavIcon name={item.icon} className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
