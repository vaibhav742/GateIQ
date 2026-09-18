export const ID_CARD_BUCKET = "id-cards";
export const ID_CARD_MAX_BYTES = 1_500_000;

export function idCardObjectPath(userId: string) {
  return `${userId}/front.jpg`;
}

export function hasIdCard(path?: string | null) {
  return Boolean(path?.trim());
}

export async function parseIdCardUpload(value: FormDataEntryValue | null) {
  if (!(value instanceof Blob) || value.size === 0) {
    return { file: null as Blob | null };
  }
  if (value.size > ID_CARD_MAX_BYTES) {
    return { error: "ID photo is too large. Capture it again." };
  }

  const bytes = new Uint8Array(await value.arrayBuffer());
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    return { error: "Capture a live photo of the front of your ID card." };
  }

  return { file: new Blob([bytes], { type: "image/jpeg" }) };
}
