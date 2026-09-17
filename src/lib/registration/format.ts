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
