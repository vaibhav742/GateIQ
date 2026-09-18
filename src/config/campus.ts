export const CAMPUS = {
  name: "IIM Calcutta",
  product: "GateIQ",
  tagline: "IIM Calcutta’s Digital Gatekeeper",
  logo: "/brand/iim-calcutta-logo.png",
  timezone: "Asia/Kolkata",
  qrPrefix: "IIMC:",
} as const;

export type UserRole = "student" | "security" | "admin";
export type CampusStatus = "INSIDE" | "OUTSIDE" | "UNKNOWN";
export type MovementAction = "ENTRY" | "EXIT";
export type AccountStatus = "active" | "inactive" | "archived";
export type RegistrationStatus = "pending" | "approved" | "rejected" | "active";

export function homeForRole(role: UserRole): string {
  switch (role) {
    case "admin":
      return "/admin";
    case "security":
      return "/security";
    default:
      return "/student";
  }
}

export function isDemoMode() {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "true";
}
