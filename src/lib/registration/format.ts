export type PublicRegistrationForm = {
  name: string;
  slug: string;
  status: "active" | "inactive";
  email_domain: string;
  batch_number: string;
  batch_name: string;
  registration_suffix: string;
};

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
