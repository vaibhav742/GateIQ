import type { UserRole } from "@/config/campus";

export type NavIconName =
  | "Activity"
  | "Building2"
  | "ClipboardList"
  | "ClipboardPen"
  | "FileSpreadsheet"
  | "LayoutDashboard"
  | "QrCode"
  | "ScanLine"
  | "Settings"
  | "Shield"
  | "Users"
  | "UserRound";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIconName;
};

export const studentNav: NavItem[] = [
  { href: "/student", label: "Home", icon: "LayoutDashboard" },
  { href: "/student/qr", label: "My QR", icon: "QrCode" },
  { href: "/student/history", label: "History", icon: "ClipboardList" },
  { href: "/student/profile", label: "Profile", icon: "UserRound" },
];

export const securityNav: NavItem[] = [
  { href: "/security", label: "Home", icon: "LayoutDashboard" },
  { href: "/security/scan", label: "Scan", icon: "ScanLine" },
  { href: "/security/students", label: "Students", icon: "Users" },
  { href: "/security/activity", label: "Activity", icon: "Activity" },
];

export const adminNav: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: "LayoutDashboard" },
  { href: "/admin/students", label: "Students", icon: "Users" },
  { href: "/admin/registration", label: "Registration", icon: "ClipboardPen" },
  { href: "/admin/security", label: "Security", icon: "Shield" },
  { href: "/admin/gates", label: "Gates", icon: "Building2" },
  { href: "/admin/logs", label: "Logs", icon: "ClipboardList" },
  { href: "/admin/reports", label: "Reports", icon: "FileSpreadsheet" },
  { href: "/admin/settings", label: "Settings", icon: "Settings" },
];

export function navForRole(role: UserRole) {
  if (role === "admin") return adminNav;
  if (role === "security") return securityNav;
  return studentNav;
}

export function mobileNavForRole(role: UserRole) {
  if (role === "admin") return adminNav.slice(0, 4);
  return navForRole(role);
}
