export const SECURITY_SHIFTS = ["morning", "night"] as const;

export type SecurityShift = (typeof SECURITY_SHIFTS)[number];

export function isSecurityShift(value: string): value is SecurityShift {
  return value === "morning" || value === "night";
}

export function securityShiftLabel(shift: string | null | undefined) {
  if (shift === "morning") return "Morning shift";
  if (shift === "night") return "Night shift";
  return "Unassigned shift";
}

export function securityAccountName(shift: SecurityShift) {
  return securityShiftLabel(shift);
}
