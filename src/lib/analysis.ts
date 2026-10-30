// Turning measured scores into findings. Pure functions, no network: every number
// shown or passed to the write-up comes from here, computed from YouCam's raw scores.
import { CONCERNS, CONCERN_LABELS, type Concern, type EventEffect, type Finding, type ReportResponse } from "../../shared/types";
import { addDays, daysBetween, formatDay } from "./dates";
import type { Photo, RoutineEvent } from "./types";

export interface Point {
  date: string;
  value: number;
  photoId: string;
}

/** Days after a routine change before its effect is counted: slow changes need time to show. */
export const LAG_DAYS = 28;
const WINDOW_DAYS = 180;

export function measured(photos: Photo[]) {
  return photos.filter((p) => p.status === "measured" && p.result).sort((a, b) => a.date.localeCompare(b.date));
}

export function series(photos: Photo[], concern: Concern): Point[] {
  return measured(photos)
    .filter((p) => !p.excluded && p.result!.scores[concern])
    .map((p) => ({ date: p.date, value: p.result!.scores[concern]!.raw, photoId: p.id }));
}

function fit(points: Point[]) {
  const x0 = points[0].date;
  const xs = points.map((p) => daysBetween(x0, p.date));
  const ys = points.map((p) => p.value);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  const slope = sxx ? sxy / sxx : 0;
  const resid = ys.map((y, i) => y - (my + slope * (xs[i] - mx)));
  const noise = n > 2 ? Math.sqrt(resid.reduce((a, r) => a + r * r, 0) / (n - 2)) : NaN;
  return { slope, noise, span: xs[n - 1] };
}

export function findings(photos: Photo[]): Finding[] {
  const out: Finding[] = [];
  for (const concern of CONCERNS) {
    const pts = series(photos, concern);
    if (pts.length < 2) continue;
    const { slope, noise, span } = fit(pts);
    const change = slope * span;
    // A change only counts if it is bigger than the photo-to-photo wobble.
    const threshold = Number.isNaN(noise) ? 5 : Math.max(4, 1.5 * noise);
    const verdict: Finding["verdict"] =
      span < 14 ? "unclear" : Math.abs(change) < threshold ? "steady" : change > 0 ? "improved" : "worsened";
    out.push({
      concern,
      first: pts[0].value,
      last: pts[pts.length - 1].value,
      delta: pts[pts.length - 1].value - pts[0].value,
      slopePerMonth: slope * 30,
      noise: Number.isNaN(noise) ? 0 : noise,
      verdict,
      points: pts.length,
    });
  }
  return out;
}

export interface Outlier {
  photoId: string;
  name: string;
  date: string;
  concerns: Concern[];
  why: string;
}

/**
 * A photo whose scores jump away from the trend on several concerns at once is more
 * likely a lighting or camera change than a real skin change. Those are set aside.
 */
export function findOutliers(photos: Photo[]): Outlier[] {
  const m = measured(photos).filter((p) => !p.excluded);
  if (m.length < 5) return [];
  const hits = new Map<string, Concern[]>();
  for (const concern of CONCERNS) {
    const pts = series(photos, concern);
    if (pts.length < 5) continue;
    pts.forEach((pt, i) => {
      // Leave-one-out: fit the trend without this point, then see how far it sits from it.
      const others = pts.filter((_, j) => j !== i);
      const { slope, noise } = fit(others);
      const x0 = others[0].date;
      const mx = others.reduce((a, p) => a + daysBetween(x0, p.date), 0) / others.length;
      const my = others.reduce((a, p) => a + p.value, 0) / others.length;
      const expected = my + slope * (daysBetween(x0, pt.date) - mx);
      const resid = pt.value - expected;
      if (Math.abs(resid) > Math.max(6, 3 * (noise || 2))) hits.set(pt.photoId, [...(hits.get(pt.photoId) ?? []), concern]);
    });
  }
  const meanBright = mean(m.map((p) => p.screen?.brightness ?? 0).filter(Boolean)) || 0;
  return [...hits]
    .filter(([, cs]) => cs.length >= 3)
    .map(([id, concerns]) => {
      const p = m.find((x) => x.id === id)!;
      const b = p.screen?.brightness;
      const light = b && meanBright ? ` Its face brightness was ${Math.round(b)} against a typical ${Math.round(meanBright)}.` : "";
      return {
        photoId: id,
        name: p.name,
        date: p.date,
        concerns,
        why: `${concerns.length} concerns jumped away from the trend at once, which points to the photo conditions rather than the skin.${light}`,
      };
    });
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Before/after averages around each routine event; only shifts larger than the noise are kept. */
export function eventEffects(photos: Photo[], events: RoutineEvent[], found: Finding[]) {
  const kept: EventEffect[] = [];
  const checked: { event: RoutineEvent; concern: Concern; shift: number; why: string }[] = [];
  for (const e of events) {
    for (const f of found) {
      const pts = series(photos, f.concern);
      const before = pts.filter((p) => p.date < e.date && daysBetween(p.date, e.date) <= WINDOW_DAYS);
      const after = pts.filter((p) => {
        const d = daysBetween(e.date, p.date);
        return d >= LAG_DAYS && d <= WINDOW_DAYS;
      });
      if (!before.length || !after.length) continue;
      const b = mean(before.map((p) => p.value));
      const a = mean(after.map((p) => p.value));
      const shift = a - b;
      const threshold = Math.max(4, f.noise);
      if (Math.abs(shift) >= threshold) {
        kept.push({
          eventId: e.id,
          label: e.label,
          date: e.date,
          concern: f.concern,
          before: b,
          after: a,
          shift,
          beforeN: before.length,
          afterN: after.length,
        });
      } else checked.push({ event: e, concern: f.concern, shift, why: `within noise (±${threshold.toFixed(1)})` });
    }
  }
  return { kept, checked };
}

export function eventsWithoutData(photos: Photo[], events: RoutineEvent[]) {
  const dates = measured(photos).filter((p) => !p.excluded).map((p) => p.date);
  return events.filter(
    (e) => !dates.some((d) => d < e.date) || !dates.some((d) => daysBetween(e.date, d) >= LAG_DAYS),
  );
}

const label = (c: Concern) => CONCERN_LABELS[c].toLowerCase();
const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** The write-up used when the language model is unavailable or its answer fails the number check. */
export function ruleReport(found: Finding[], effects: EventEffect[], events: RoutineEvent[], photos: Photo[]): ReportResponse {
  const up = found.filter((f) => f.verdict === "improved").map((f) => label(f.concern));
  const down = found.filter((f) => f.verdict === "worsened").map((f) => label(f.concern));
  const flat = found.filter((f) => f.verdict === "steady").map((f) => label(f.concern));
  const parts: string[] = [];
  if (up.length) parts.push(`Your ${list(up)} measured better over this period.`);
  if (down.length) parts.push(`Your ${list(down)} measured worse, which is worth showing a dermatologist.`);
  if (flat.length) parts.push(`${list(flat).replace(/^./, (c) => c.toUpperCase())} held steady within the normal photo-to-photo variation.`);
  if (!parts.length) parts.push("There isn't enough spread in time yet to call any change.");

  const keep: string[] = [];
  const drop: string[] = [];
  for (const e of events) {
    const fx = effects.filter((x) => x.eventId === e.id);
    const good = fx.filter((x) => x.shift > 0).map((x) => label(x.concern));
    const bad = fx.filter((x) => x.shift < 0).map((x) => label(x.concern));
    if (e.kind === "start" && good.length && !bad.length) keep.push(`"${e.label}" lines up with better ${list(good)}.`);
    if (e.kind === "start" && bad.length) drop.push(`"${e.label}" lines up with worse ${list(bad)}; consider pausing it and checking again.`);
    if (e.kind === "stop" && good.length) keep.push(`Since "${e.label}", ${list(good)} measured better; keep it stopped.`);
    if (e.kind === "stop" && bad.length) drop.push(`Since "${e.label}", ${list(bad)} measured worse; it may have been helping.`);
    if (e.kind === "start" && !fx.length) {
      const after = measured(photos).filter((p) => daysBetween(e.date, p.date) >= 56).length;
      if (after >= 2) drop.push(`"${e.label}" shows no measurable change after two months or more.`);
    }
  }
  const test = [
    down.length
      ? `Change one thing at a time for ${list(down)}, and book a dermatologist if it keeps dropping.`
      : "Change one thing at a time so the next check-in can tell what made the difference.",
    "Take each new photo in the same spot and light so the trend stays readable.",
  ];
  return { source: "rules", summary: parts.join(" "), keep, drop, test };
}

export interface CheckIn {
  date: string;
  why: string;
  tips: { text: string; emphasis: boolean; because?: string }[];
}

export function nextCheckIn(photos: Photo[], events: RoutineEvent[], today: string): CheckIn {
  const recent = [...events]
    .filter((e) => e.kind !== "note" && daysBetween(e.date, today) <= 120 && e.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  let date = addDays(today, 28);
  let why = "Four weeks gives slow changes time to show up between photos.";
  if (recent) {
    const target = addDays(recent.date, 84);
    if (target > date) {
      date = target;
      why = `Twelve weeks after "${recent.label}" (${formatDay(recent.date)}) is a fair trial for a routine change.`;
    } else why = `"${recent.label}" has had time to settle; four more weeks will confirm the trend.`;
  }

  const reasons = photos.flatMap((p) => p.reasons).join(" ");
  const m = measured(photos);
  const bright = m.map((p) => p.screen?.brightness).filter((b): b is number => b != null);
  const brightSpread = bright.length > 2 ? Math.sqrt(mean(bright.map((b) => (b - mean(bright)) ** 2))) : 0;
  const tips: CheckIn["tips"] = [
    {
      text: "Face a window in daylight, same spot and time of day as last time.",
      emphasis: /dark|bright|blown/i.test(reasons) || brightSpread > 22,
      because: brightSpread > 22 ? "Lighting varied a lot across your measured photos, the biggest source of noise." : undefined,
    },
    {
      text: "Hold the phone at eye level, close enough that your face fills most of the frame.",
      emphasis: /small|cropped/i.test(reasons),
      because: /small|cropped/i.test(reasons) ? "Several older photos had to be cropped to get your face large enough." : undefined,
    },
    { text: "Look straight into the lens with a relaxed, neutral face.", emphasis: /turned|tilted/i.test(reasons) },
    { text: "Hair off your forehead, glasses off, no makeup.", emphasis: false },
    { text: "Hold still and tap to focus, so the photo is sharp.", emphasis: /blur|soft/i.test(reasons) },
  ];
  return { date, why, tips };
}

/** An .ics file for the next check-in, generated on the device. */
export function icsFor(checkIn: CheckIn) {
  const d = checkIn.date.replace(/-/g, "");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Baseline//Check-in//EN",
    "BEGIN:VEVENT",
    `UID:baseline-${d}@baseline`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART;VALUE=DATE:${d}`,
    "SUMMARY:Baseline skin check-in photo",
    `DESCRIPTION:${checkIn.why} ${checkIn.tips.map((t) => t.text).join(" ")}`.replace(/,/g, "\\,"),
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
