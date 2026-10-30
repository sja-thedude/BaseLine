// The lite build reads EXIF from JPEG and PNG, which is all a browser can decode here.
import exifr from "exifr/dist/lite.esm.mjs";

export type DateSource = "exif" | "filename" | "file" | "manual";

// Camera-roll naming schemes: IMG_20230412_..., PXL_20230412..., 2023-04-12 ..., WhatsApp Image 2023-04-12
const NAME_PATTERNS = [/(20\d{2})[-_.]?(0[1-9]|1[0-2])[-_.]?(0[1-9]|[12]\d|3[01])/];

export const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export async function photoDate(file: File): Promise<{ date: string; source: DateSource }> {
  try {
    const tags = await exifr.parse(file, ["DateTimeOriginal", "CreateDate", "DateTimeDigitized"]);
    const d: unknown = tags?.DateTimeOriginal ?? tags?.CreateDate ?? tags?.DateTimeDigitized;
    if (d instanceof Date && !isNaN(+d) && d.getFullYear() > 2000) return { date: isoDay(d), source: "exif" };
  } catch {
    // No readable EXIF; fall through.
  }
  for (const re of NAME_PATTERNS) {
    const m = file.name.match(re);
    if (m) {
      const d = new Date(+m[1], +m[2] - 1, +m[3]);
      if (d <= new Date()) return { date: isoDay(d), source: "filename" };
    }
  }
  return { date: isoDay(new Date(file.lastModified)), source: "file" };
}

export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

export const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * 86_400_000).toISOString().slice(0, 10);

export const formatDay = (iso: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) =>
  new Date(iso + "T12:00:00").toLocaleDateString(undefined, opts);
