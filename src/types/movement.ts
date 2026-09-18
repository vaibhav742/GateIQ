export type LookupSuccess = {
  success: true;
  student: {
    id: string;
    name: string;
    roll_number: string | null;
    batch: string | null;
    section: string | null;
    account_status: string;
  };
  campus_status: "INSIDE" | "OUTSIDE" | "UNKNOWN";
  next_action: "ENTRY" | "EXIT";
  gate: { id: string; name: string } | null;
  last_event: { action: string; timestamp: string; gate: string | null } | null;
};

export type MovementSuccess = {
  success: true;
  student: {
    id?: string;
    name: string;
    roll_number: string | null;
    batch?: string | null;
    section?: string | null;
  };
  action: "ENTRY" | "EXIT";
  status: "INSIDE" | "OUTSIDE";
  gate: string;
  timestamp: string;
  verification_method?: "QR" | "MANUAL" | "ADMIN_OVERRIDE" | string;
};

export type RpcFailure = {
  success: false;
  code: string;
  message: string;
  campus_status?: string;
  student?: { name?: string; roll_number?: string | null };
};

export function asRpcPayload<T>(value: unknown): T {
  return value as T;
}

export function scanErrorCopy(code: string, fallback: string) {
  switch (code) {
    case "QR_INVALID":
    case "QR_REVOKED":
      return {
        title: "QR not recognized",
        message: "This QR is invalid or has been revoked.",
      };
    case "STUDENT_INACTIVE":
      return {
        title: "Access unavailable",
        message: "This student's campus account is inactive. Please contact administration.",
      };
    case "ALREADY_INSIDE":
      return {
        title: "Already inside",
        message: "This student was already marked as inside campus.",
      };
    case "ALREADY_OUTSIDE":
      return {
        title: "Already outside",
        message: "This student was already marked as outside campus.",
      };
    case "INVALID_ROLL":
      return {
        title: "Check registration number",
        message: "Enter a registration number like 0308/63.",
      };
    case "STUDENT_NOT_FOUND":
      return {
        title: "Student not found",
        message: "No student found with that registration number.",
      };
    case "NO_ENTRY_TODAY":
      return {
        title: "No entry today",
        message: "This student has no entry recorded today. Record ENTRY first.",
      };
    case "INVALID_ACTION":
      return {
        title: "Unable to complete",
        message: "Choose ENTRY or EXIT.",
      };
    case "NO_GATE":
      return {
        title: "No gate assigned",
        message: "You are not assigned to an active gate.",
      };
    case "UNAUTHENTICATED":
      return {
        title: "Session expired",
        message: "Please sign in again.",
      };
    default:
      if (fallback.toLowerCase().includes("fetch") || fallback.toLowerCase().includes("network")) {
        return {
          title: "Connection lost",
          message: "Unable to contact the campus server. Please check your connection and try again.",
        };
      }
      return {
        title: "Unable to complete",
        message: fallback || "Something went wrong. Please try again.",
      };
  }
}
