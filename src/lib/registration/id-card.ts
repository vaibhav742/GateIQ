export const ID_CARD_BUCKET = "id-cards";
export const ID_CARD_MAX_BYTES = 1_500_000;

export function idCardObjectPath(userId: string) {
  return `${userId}/front.jpg`;
}
