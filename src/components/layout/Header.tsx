"use client";

import { Menu } from "lucide-react";
import { signOutAction } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Sidebar } from "@/components/layout/Sidebar";
import type { NavItem } from "@/config/nav";
import type { Profile } from "@/types/database";
import { BrandLockup } from "@/components/brand/BrandMark";

export function Header({
  profile,
  items,
  context,
}: {
  profile: Profile;
  items: NavItem[];
  context?: string;
}) {
  return (
    <header className="sticky top-0 z-30 flex min-h-14 items-center justify-between gap-3 border-b border-border/80 bg-white/90 px-4 py-2 backdrop-blur md:h-14 md:px-6 md:py-0">
      <div className="flex min-w-0 items-center gap-2 md:hidden">
        <Sheet>
          <SheetTrigger
            render={
              <Button variant="ghost" size="icon" aria-label="Open navigation" />
            }
          >
            <Menu className="size-5" />
          </SheetTrigger>
          <SheetContent side="left" className="w-[260px] p-0" showCloseButton={false}>
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation</SheetTitle>
            </SheetHeader>
            <div className="h-full">
              <Sidebar items={items} variant="drawer" />
            </div>
          </SheetContent>
        </Sheet>
        <div className="min-w-0">
          <BrandLockup size="sm" />
        </div>
      </div>

      <div className="hidden min-w-0 md:block">
        {context ? (
          <p className="truncate text-sm text-muted-foreground">{context}</p>
        ) : (
          <p className="text-sm text-muted-foreground">Campus operations</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden min-w-0 text-right sm:block">
          <p className="truncate text-sm font-medium leading-none">{profile.full_name}</p>
          <p className="mt-1 text-[11px] tracking-wide text-muted-foreground uppercase">
            {profile.role}
          </p>
        </div>
        <form action={signOutAction}>
          <Button variant="outline" size="sm" type="submit">
            Sign out
          </Button>
        </form>
      </div>
    </header>
  );
}
