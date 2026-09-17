"use client";

import {
  Activity,
  Building2,
  ClipboardList,
  ClipboardPen,
  FileSpreadsheet,
  LayoutDashboard,
  QrCode,
  ScanLine,
  Settings,
  Shield,
  Users,
  UserRound,
} from "lucide-react";
import type { NavIconName } from "@/config/nav";

const icons = {
  Activity,
  Building2,
  ClipboardList,
  ClipboardPen,
  FileSpreadsheet,
  LayoutDashboard,
  QrCode,
  ScanLine,
  Settings,
  Shield,
  Users,
  UserRound,
} as const;

export function NavIcon({
  name,
  className,
}: {
  name: NavIconName;
  className?: string;
}) {
  const Icon = icons[name];
  return <Icon className={className} />;
}
