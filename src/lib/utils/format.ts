import { CAMPUS } from "@/config/campus";

export function encodeQrPayload(token: string) {
  return `${CAMPUS.qrPrefix}${token}`;
}

export function isLiveStudentQr(expiresAt: string | null | undefined, status?: string) {
  if (status && status !== "active") return false;
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() > Date.now();
}

export function campusDateISO(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CAMPUS.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatCampusDate(value: string | Date = new Date()) {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: CAMPUS.timezone,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatCampusTime(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: CAMPUS.timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function formatCampusDateTime(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: CAMPUS.timezone,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function greetingForNow(date = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat("en-IN", {
      timeZone: CAMPUS.timezone,
      hour: "numeric",
      hour12: false,
    }).format(date),
  );

  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function campusDayBounds(dayISO = campusDateISO()) {
  const start = new Date(`${dayISO}T00:00:00+05:30`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString(), dayISO };
}

export function firstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

export function formatCount(value: number) {
  return new Intl.NumberFormat("en-IN").format(value);
}

export function csvEscape(value: string | number | boolean | null | undefined) {
  const raw = value == null ? "" : String(value);
  if (/[",\n\r]/.test(raw)) {
    return `"${raw.replaceAll('"', '""')}"`;
  }
  return raw;
}

export function toCsv(rows: Array<Array<string | number | boolean | null | undefined>>) {
  return `\uFEFF${rows.map((row) => row.map(csvEscape).join(",")).join("\r\n")}\r\n`;
}
