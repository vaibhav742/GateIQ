export const DEFAULT_EMAIL_DOMAIN = "email.iimcal.ac.in";

export type PublicRegistrationForm = {
  name: string;
  slug: string;
  status: "active" | "inactive";
  email_domain: string;
  batch_number: string;
  batch_name: string;
  registration_suffix: string;
  hostels: string[];
};

export function extractEmailLocalPart(value: string, domain: string) {
  const trimmed = value.trim().toLowerCase();
  const normalizedDomain = normalizeEmailDomain(domain);
  if (normalizedDomain && trimmed.endsWith(`@${normalizedDomain}`)) {
    return trimmed.slice(0, -(normalizedDomain.length + 1));
  }
  return trimmed.replace(/@.*$/, "");
}

export function isEmailLocalPart(value: string) {
  return /^[a-z0-9._-]+$/.test(value);
}

export function resolveStudentEmail(value: string) {
  const local = extractEmailLocalPart(value, DEFAULT_EMAIL_DOMAIN);
  if (!isEmailLocalPart(local)) return null;
  return `${local}@${DEFAULT_EMAIL_DOMAIN}`;
}

export function slugFromBatch(batchNumber: string) {
  return `pgp${batchNumber.trim().toLowerCase()}`;
}

export function normalizeEmailDomain(domain: string) {
  return domain.trim().replace(/^@+/, "").toLowerCase();
}

export function displayEmailDomain(domain: string) {
  const value = normalizeEmailDomain(domain);
  return value ? `@${value}` : "";
}

export function buildRegistrationNumber(serial: string, batchNumber: string) {
  const value = serial.trim();
  if (!/^[0-9]{3,8}$/.test(value) || !batchNumber.trim()) return null;
  return `${value}/${batchNumber.trim()}`;
}

export function normalizeRegistrationNumber(value: string) {
  const roll = value.trim().replace(/\s+/g, "").replace("-", "/").toUpperCase();
  if (!/^[0-9]{3,8}\/[0-9]{2,4}$/.test(roll)) return null;
  return roll;
}

export function verificationMethodLabel(method?: string | null) {
  if (method === "MANUAL") return "Manual";
  if (method === "ADMIN_OVERRIDE") return "Admin override";
  if (method === "QR") return "QR";
  return method?.trim() ? method : "QR";
}
