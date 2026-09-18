import { ID_CARD_MAX_BYTES } from "@/lib/registration/id-card";

export const ID_CARD_WIDTH = 1120;
export const ID_CARD_HEIGHT = 706;

type Rect = { x: number; y: number; width: number; height: number };

export async function processIdCardBlob(source: Blob, crop?: Rect): Promise<File> {
  const bitmap = await createImageBitmap(source);
  try {
    const region = crop ?? detectDocumentRect(bitmap) ?? {
      x: 0,
      y: 0,
      width: bitmap.width,
      height: bitmap.height,
    };
    const blob = await renderIdCard(bitmap, region);
    if (blob.size > ID_CARD_MAX_BYTES) {
      throw new Error("ID photo is too large. Move closer and try again.");
    }
    return new File([blob], "id-card.jpg", { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}

export function overlayCropFromVideo(
  video: HTMLVideoElement,
  container: DOMRect,
  overlay: DOMRect,
): Rect {
  const scale = Math.max(container.width / video.videoWidth, container.height / video.videoHeight);
  const displayedWidth = video.videoWidth * scale;
  const displayedHeight = video.videoHeight * scale;
  const offsetX = (container.width - displayedWidth) / 2;
  const offsetY = (container.height - displayedHeight) / 2;

  return {
    x: clamp((overlay.left - container.left - offsetX) / scale, 0, video.videoWidth),
    y: clamp((overlay.top - container.top - offsetY) / scale, 0, video.videoHeight),
    width: clamp(overlay.width / scale, 1, video.videoWidth),
    height: clamp(overlay.height / scale, 1, video.videoHeight),
  };
}

function detectDocumentRect(bitmap: ImageBitmap): Rect | null {
  const sampleWidth = 320;
  const sampleHeight = Math.max(1, Math.round((bitmap.height / bitmap.width) * sampleWidth));
  const canvas = document.createElement("canvas");
  canvas.width = sampleWidth;
  canvas.height = sampleHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, sampleWidth, sampleHeight);
  const { data, width, height } = ctx.getImageData(0, 0, sampleWidth, sampleHeight);

  const border: number[] = [];
  for (let x = 0; x < width; x += 1) {
    border.push(luma(data, x, 0, width), luma(data, x, height - 1, width));
  }
  for (let y = 0; y < height; y += 1) {
    border.push(luma(data, 0, y, width), luma(data, width - 1, y, width));
  }
  const background = median(border);
  const threshold = 28;

  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      if (Math.abs(luma(data, x, y, width) - background) < threshold) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      count += 1;
    }
  }

  const area = (maxX - minX) * (maxY - minY);
  if (count < 400 || area < width * height * 0.18) return null;

  const padX = Math.round((maxX - minX) * 0.03);
  const padY = Math.round((maxY - minY) * 0.03);
  const scaleX = bitmap.width / sampleWidth;
  const scaleY = bitmap.height / sampleHeight;

  return {
    x: Math.max(0, (minX - padX) * scaleX),
    y: Math.max(0, (minY - padY) * scaleY),
    width: Math.min(bitmap.width, (maxX - minX + padX * 2) * scaleX),
    height: Math.min(bitmap.height, (maxY - minY + padY * 2) * scaleY),
  };
}

async function renderIdCard(bitmap: ImageBitmap, region: Rect): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = ID_CARD_WIDTH;
  canvas.height = ID_CARD_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Unable to process the ID photo.");

  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, ID_CARD_WIDTH, ID_CARD_HEIGHT);
  ctx.filter = "contrast(1.08) saturate(1.04)";
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    bitmap,
    region.x,
    region.y,
    region.width,
    region.height,
    0,
    0,
    ID_CARD_WIDTH,
    ID_CARD_HEIGHT,
  );
  ctx.filter = "none";

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", 0.72);
  });
  if (!blob) throw new Error("Unable to compress the ID photo.");
  return blob;
}

function luma(data: Uint8ClampedArray, x: number, y: number, width: number) {
  const i = (y * width + x) * 4;
  return data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
