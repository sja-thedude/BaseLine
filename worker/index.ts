/**
 * Baseline worker. /api/* is handled here; everything else is the static app.
 *
 *   GET  /api/status          unit budget and whether YouCam is configured
 *   GET  /api/cache/:hash     the cached result for an image hash, or null (free)
 *   POST /api/analyze         image bytes → cached result, or a started YouCam task
 *   GET  /api/task/:id        poll a task; on success the scores are cached by hash
 *   POST /api/report          Workers AI write-up of findings computed in the browser
 *
 * Privacy: image bytes are held in memory only for the length of the request
 * that forwards them to YouCam. Nothing about the image is written anywhere
 * except its SHA-256 and the scores. Request bodies are never logged.
 */
import { UNITS_PER_PHOTO, type AnalyzeResponse, type ReportRequest, type SkinResult, type StatusResponse } from "../shared/types";
import { ERROR_TEXT, YouCamError, pollAnalysis, startAnalysis } from "./youcam";
import { writeReport } from "./report";

export interface Env {
  ASSETS: Fetcher;
  CACHE: KVNamespace;
  AI?: Ai;
  YOUCAM_API_KEY?: string;
  UNIT_BUDGET?: string;
  PER_VISITOR_DAILY?: string;
}

const MAX_BYTES = 8 * 1024 * 1024;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const fail = (status: number, code: string, message: string) => json({ error: code, message }, status);

async function sha256(data: ArrayBuffer | string) {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const today = () => new Date().toISOString().slice(0, 10);

/** Visitors are counted by a salted daily hash of their IP; the IP itself is never stored. */
async function visitorKey(req: Request) {
  const ip = req.headers.get("CF-Connecting-IP") || "local";
  return `v:${today()}:${(await sha256(`baseline:${today()}:${ip}`)).slice(0, 24)}`;
}

async function readInt(kv: KVNamespace, key: string) {
  return parseInt((await kv.get(key)) || "0", 10) || 0;
}

async function addUnits(env: Env, delta: number) {
  const spent = Math.max(0, (await readInt(env.CACHE, "units:spent")) + delta);
  await env.CACHE.put("units:spent", String(spent));
  return spent;
}

function limits(env: Env) {
  return {
    budget: parseInt(env.UNIT_BUDGET || "900", 10),
    perVisitor: parseInt(env.PER_VISITOR_DAILY || "12", 10),
  };
}

async function status(req: Request, env: Env): Promise<Response> {
  const { budget, perVisitor } = limits(env);
  const body: StatusResponse = {
    configured: Boolean(env.YOUCAM_API_KEY),
    unitsSpent: await readInt(env.CACHE, "units:spent"),
    unitsBudget: budget,
    unitsPerPhoto: UNITS_PER_PHOTO,
    perVisitorDaily: perVisitor,
    visitorUsedToday: await readInt(env.CACHE, await visitorKey(req)),
  };
  return json(body);
}

async function cached(env: Env, hash: string): Promise<Response> {
  if (!/^[a-f0-9]{64}$/.test(hash)) return fail(400, "bad_hash", "That isn't an image hash.");
  // A miss is a normal answer, not an error: null means "not measured yet".
  return json(await env.CACHE.get<SkinResult>(`r:${hash}`, "json"));
}

function imageType(bytes: Uint8Array) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  return null;
}

async function analyze(req: Request, env: Env): Promise<Response> {
  const image = await req.arrayBuffer();
  if (!image.byteLength) return fail(400, "empty", "No photo was sent.");
  if (image.byteLength > MAX_BYTES) return fail(413, "too_large", "That photo is over 8 MB.");
  const type = imageType(new Uint8Array(image, 0, 4));
  if (!type) return fail(415, "not_image", "Only JPEG and PNG photos can be measured.");

  const hash = await sha256(image);
  const hit = await env.CACHE.get<SkinResult>(`r:${hash}`, "json");
  if (hit) return json({ status: "done", cached: true, result: hit, unitsCharged: 0 } satisfies AnalyzeResponse);

  if (!env.YOUCAM_API_KEY) return fail(503, "not_configured", "Skin analysis isn't switched on for this deployment yet.");

  const { budget, perVisitor } = limits(env);
  const spent = await readInt(env.CACHE, "units:spent");
  if (spent + UNITS_PER_PHOTO > budget) {
    return fail(402, "budget", "The shared analysis budget for this demo has run out. Cached results still work.");
  }
  const vKey = await visitorKey(req);
  const used = await readInt(env.CACHE, vKey);
  if (used >= perVisitor) {
    return fail(429, "visitor_limit", `Each visitor can measure ${perVisitor} new photos a day, so the demo budget lasts for everyone.`);
  }

  try {
    const taskId = await startAnalysis(env.YOUCAM_API_KEY, image, type);
    // Reserve the units now; they are refunded if the task errors.
    await addUnits(env, UNITS_PER_PHOTO);
    await env.CACHE.put(vKey, String(used + 1), { expirationTtl: 60 * 60 * 48 });
    await env.CACHE.put(`t:${taskId}`, JSON.stringify({ hash }), { expirationTtl: 60 * 60 * 24 });
    return json({ status: "running", taskId, hash } satisfies AnalyzeResponse);
  } catch (e) {
    if (e instanceof YouCamError) return fail(e.status, e.code, e.message);
    throw e;
  }
}

async function task(env: Env, taskId: string): Promise<Response> {
  if (!env.YOUCAM_API_KEY) return fail(503, "not_configured", "Skin analysis isn't switched on.");
  const meta = await env.CACHE.get<{ hash: string; settled?: boolean }>(`t:${taskId}`, "json");
  if (!meta) return fail(404, "unknown_task", "That analysis has expired. Run the photo again.");

  try {
    const state = await pollAnalysis(env.YOUCAM_API_KEY, taskId);
    if (state.state === "running") return json({ status: "running", taskId, hash: meta.hash } satisfies AnalyzeResponse);

    if (state.state === "error") {
      // YouCam doesn't charge for failed tasks, so release the reservation once.
      if (!meta.settled) {
        await addUnits(env, -UNITS_PER_PHOTO);
        await env.CACHE.put(`t:${taskId}`, JSON.stringify({ ...meta, settled: true }), { expirationTtl: 60 * 60 * 24 });
      }
      return json({
        status: "failed",
        code: state.code,
        message: ERROR_TEXT[state.code] || "YouCam couldn't measure this photo.",
        unitsCharged: 0,
      } satisfies AnalyzeResponse);
    }

    const result: SkinResult = {
      hash: meta.hash,
      scores: state.scores,
      overall: state.overall,
      skinAge: state.skinAge,
      measuredAt: new Date().toISOString(),
    };
    const first = !meta.settled;
    if (first) {
      await env.CACHE.put(`r:${meta.hash}`, JSON.stringify(result));
      await env.CACHE.put(`t:${taskId}`, JSON.stringify({ ...meta, settled: true }), { expirationTtl: 60 * 60 * 24 });
    }
    return json({ status: "done", cached: false, result, unitsCharged: first ? UNITS_PER_PHOTO : 0 } satisfies AnalyzeResponse);
  } catch (e) {
    if (e instanceof YouCamError) return fail(e.status, e.code, e.message);
    throw e;
  }
}

async function report(req: Request, env: Env): Promise<Response> {
  let body: ReportRequest;
  try {
    body = await req.json();
  } catch {
    return fail(400, "bad_json", "The report request was malformed.");
  }
  if (!Array.isArray(body.findings) || !Array.isArray(body.effects)) return fail(400, "bad_request", "Missing findings.");
  if (!env.AI) return fail(503, "no_ai", "The language model isn't available.");
  const out = await writeReport(env.AI, body);
  return out.ok ? json(out.report) : json({ error: out.code, message: out.message, detail: out.detail }, 422);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);

    try {
      const path = url.pathname.slice(5);
      if (path === "status" && req.method === "GET") return status(req, env);
      if (path.startsWith("cache/") && req.method === "GET") return cached(env, path.slice(6));
      if (path === "analyze" && req.method === "POST") return analyze(req, env);
      if (path.startsWith("task/") && req.method === "GET") return task(env, decodeURIComponent(path.slice(5)));
      if (path === "report" && req.method === "POST") return report(req, env);
      return fail(404, "not_found", "No such endpoint.");
    } catch (e) {
      // Log the failure type only, never the request body.
      console.error("api_error", url.pathname, e instanceof Error ? e.name : "unknown");
      return fail(500, "internal", "Something went wrong on our side. Please try again.");
    }
  },
} satisfies ExportedHandler<Env>;
