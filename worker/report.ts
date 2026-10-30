/**
 * The narrative step of the agent. The browser has already computed every
 * number (deltas, trends, before/after shifts). The model only explains them,
 * and its output is checked: any number in the text that isn't one of the
 * computed values gets the write-up rejected, so a measurement is never invented.
 */
import { CONCERN_LABELS, type ReportRequest, type ReportResponse } from "../shared/types";

export const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const SYSTEM = `You write the summary for Baseline, an app that tracks skin measurements from a person's own selfies over time.
The measurements come from YouCam Skin AI. Scores run 1-100 and HIGHER IS HEALTHIER for every concern (a rising wrinkle score means fewer visible wrinkles).

Rules you must follow:
- Use only the facts given. Never state a number that is not in the facts. Prefer words ("a small rise") over numbers.
- This is not medical or dermatological advice. Never diagnose, never name a condition, never name a product or brand.
- Correlation is not causation. Say a change "lines up with" a routine event, never that the event caused it.
- If any concern clearly worsened, say plainly that it is worth showing a dermatologist. Never suggest a product for a worsening concern.
- "keep" and "drop" may ONLY restate the evidence lines given under KEEP EVIDENCE and DROP EVIDENCE, in friendlier words, keeping the routine change's name. If there is no evidence line, return an empty list. Never add a routine change to keep or drop on your own.
- "test": one or two simple next experiments (change one thing at a time, keep photo conditions the same).
- Each list item is one full sentence that names the routine change it is about. The summary is 2-4 sentences, plain and warm, second person.
Return JSON only: {"summary": string, "keep": string[], "drop": string[], "test": string[]}`;

function facts(r: ReportRequest) {
  const lines = [`Photos measured: ${r.photos}, spanning ${r.spanDays} days.`];
  for (const f of r.findings) {
    lines.push(
      `${CONCERN_LABELS[f.concern]}: ${f.verdict}. First ${f.first.toFixed(1)}, latest ${f.last.toFixed(1)}, change ${f.delta.toFixed(1)}, trend ${f.slopePerMonth.toFixed(1)} per month, photo-to-photo noise about ${f.noise.toFixed(1)}.`,
    );
  }
  for (const e of r.events) lines.push(`Routine event on ${e.date}: ${e.kind} "${e.label}".`);
  for (const e of r.effects) {
    lines.push(
      `Around "${e.label}" (${e.date}), ${CONCERN_LABELS[e.concern]} averaged ${e.before.toFixed(1)} before and ${e.after.toFixed(1)} after (shift ${e.shift.toFixed(1)}).`,
    );
  }
  lines.push("", "KEEP EVIDENCE:", ...(r.evidence?.keep.length ? r.evidence.keep : ["(none)"]));
  lines.push("", "DROP EVIDENCE:", ...(r.evidence?.drop.length ? r.evidence.drop : ["(none)"]));
  return lines.join("\n");
}

/** Labels of routine changes that the evidence lines are about. */
function labelsIn(lines: string[], r: ReportRequest) {
  return r.events.filter((e) => lines.some((l) => l.toLowerCase().includes(e.label.toLowerCase()))).map((e) => e.label.toLowerCase());
}

/** A keep/drop item must be about a routine change that its evidence list supports. */
export function unsupportedItems(items: string[], evidence: string[], r: ReportRequest) {
  const ok = labelsIn(evidence, r);
  const all = r.events.map((e) => e.label.toLowerCase());
  return items.filter((item) => {
    const t = item.toLowerCase();
    const named = all.filter((l) => t.includes(l) || l.split(/\s+/).filter((w) => w.length > 4).some((w) => t.includes(w)));
    return named.length === 0 ? true : named.some((l) => !ok.includes(l));
  });
}

/** Every number the model is allowed to say. */
function allowedNumbers(r: ReportRequest) {
  const out: number[] = [r.photos, r.spanDays, Math.round(r.spanDays / 7), Math.round(r.spanDays / 30)];
  for (const f of r.findings) out.push(f.first, f.last, f.delta, f.slopePerMonth, f.noise, f.points);
  for (const e of r.effects) out.push(e.before, e.after, e.shift, e.beforeN, e.afterN);
  for (const e of r.events) {
    out.push(...e.date.split("-").map(Number));
    // The person's own labels can carry numbers ("retinol 0.3%"); quoting them is fine.
    out.push(...(e.label.match(/\d+(?:\.\d+)?/g) ?? []).map(Number));
  }
  return out.flatMap((n) => [n, Math.abs(n)]);
}

export function unverifiedNumbers(text: string, allowed: number[]) {
  const found = text.match(/\d+(?:\.\d+)?/g) ?? [];
  return found.filter((s) => {
    const n = parseFloat(s);
    if (Number.isInteger(n) && n <= 12 && !s.includes(".")) return false; // counts like "two weeks", "3 photos"
    return !allowed.some((a) => Math.abs(a - n) < 0.15 || Math.round(a) === n);
  });
}

const asList = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 4) : []);

export async function writeReport(
  ai: Ai,
  req: ReportRequest,
): Promise<{ ok: true; report: ReportResponse } | { ok: false; code: string; message: string; detail?: unknown }> {
  let raw: unknown;
  try {
    raw = await ai.run(MODEL as any, {
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: facts(req) },
      ],
      max_tokens: 700,
      temperature: 0.2,
      response_format: {
        type: "json_schema",
        json_schema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            keep: { type: "array", items: { type: "string" } },
            drop: { type: "array", items: { type: "string" } },
            test: { type: "array", items: { type: "string" } },
          },
          required: ["summary", "keep", "drop", "test"],
        },
      },
    } as any);
  } catch (e) {
    console.error("ai_error", e instanceof Error ? e.message : "unknown");
    return { ok: false, code: "model_error", message: "The language model didn't respond." };
  }

  let parsed: any = (raw as any)?.response;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed.slice(parsed.indexOf("{"), parsed.lastIndexOf("}") + 1));
    } catch {
      return { ok: false, code: "unparseable", message: "The model's answer wasn't valid JSON." };
    }
  }
  if (!parsed || typeof parsed.summary !== "string") {
    return { ok: false, code: "unparseable", message: "The model's answer was missing a summary." };
  }

  const report: ReportResponse = {
    source: "workers-ai",
    model: MODEL,
    summary: parsed.summary,
    keep: asList(parsed.keep),
    drop: asList(parsed.drop),
    test: asList(parsed.test),
  };
  const off = [
    ...unsupportedItems(report.keep, req.evidence?.keep ?? [], req),
    ...unsupportedItems(report.drop, req.evidence?.drop ?? [], req),
  ];
  if (off.length || report.keep.length > (req.evidence?.keep.length ?? 0) || report.drop.length > (req.evidence?.drop.length ?? 0)) {
    return { ok: false, code: "unsupported_advice", message: "The write-up recommended something the measurements don't support.", detail: off };
  }
  const text = [report.summary, ...report.keep, ...report.drop, ...report.test].join(" ");
  const bad = unverifiedNumbers(text, allowedNumbers(req));
  if (bad.length) {
    return { ok: false, code: "unverified_numbers", message: "The write-up quoted numbers that weren't measured.", detail: bad };
  }
  return { ok: true, report };
}
