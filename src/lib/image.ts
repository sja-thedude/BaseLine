// Image handling in the browser: decode, measure quality, crop, re-encode, hash.
// Re-encoding through a canvas strips EXIF (including GPS) before anything leaves the device.

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export async function decode(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: "from-image" });
}

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.round(w);
  c.height = Math.round(h);
  return c;
}

/** Brightness, clipping and sharpness, measured on the face region at a small fixed size. */
export function lightingAndFocus(img: ImageBitmap, region?: Box) {
  const r = region ?? { x: 0, y: 0, w: img.width, h: img.height };
  const size = 256;
  const scale = size / Math.max(r.w, r.h);
  const c = canvas(r.w * scale, r.h * scale);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
  const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);

  const gray = new Float32Array(width * height);
  let sum = 0;
  let hi = 0;
  let lo = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const y = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    gray[p] = y;
    sum += y;
    if (y > 250) hi++;
    if (y < 12) lo++;
  }
  const n = width * height;

  // Variance of the Laplacian: low values mean a soft or motion-blurred photo.
  let lapSum = 0;
  let lapSq = 0;
  let m = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const v = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - width] - gray[i + width];
      lapSum += v;
      lapSq += v * v;
      m++;
    }
  }
  const lapMean = lapSum / m;
  return {
    brightness: sum / n,
    highlights: hi / n,
    shadows: lo / n,
    sharpness: lapSq / m - lapMean * lapMean,
  };
}

/** A crop around the face so it fills ~70% of the width, as YouCam asks for (>60%). */
export function cropForFace(img: ImageBitmap, face: Box): Box | null {
  const w = Math.min(img.width, face.w / 0.7);
  const h = Math.min(img.height, w * 1.33);
  const cx = face.x + face.w / 2;
  const cy = face.y + face.h / 2;
  const x = Math.max(0, Math.min(img.width - w, cx - w / 2));
  const y = Math.max(0, Math.min(img.height - h, cy - h * 0.45));
  if (Math.min(w, h) < 480) return null;
  return { x, y, w, h };
}

/** JPEG for upload: optional crop, long side capped at 2048px. */
export async function encode(img: ImageBitmap, crop?: Box): Promise<Blob> {
  const r = crop ?? { x: 0, y: 0, w: img.width, h: img.height };
  const scale = Math.min(1, 2048 / Math.max(r.w, r.h));
  const c = canvas(r.w * scale, r.h * scale);
  c.getContext("2d")!.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), "image/jpeg", 0.92));
}

/** Small thumbnail kept in memory only (object URL), never uploaded or stored. */
export async function thumbnail(img: ImageBitmap, crop?: Box): Promise<string> {
  const r = crop ?? { x: 0, y: 0, w: img.width, h: img.height };
  const scale = 360 / Math.max(r.w, r.h);
  const c = canvas(r.w * scale, r.h * scale);
  c.getContext("2d")!.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
  const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), "image/jpeg", 0.8));
  return URL.createObjectURL(blob);
}

export async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
