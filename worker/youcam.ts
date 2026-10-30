/**
 * YouCam Skin AI client (S2S v2.0).
 *
 *   1. POST /s2s/v2.0/file              → file_id + pre-signed PUT url
 *   2. PUT the image bytes to that url
 *   3. POST /s2s/v2.0/task/skin-analysis → task_id
 *   4. GET  /s2s/v2.0/task/skin-analysis/{task_id} until success | error
 *
 * Units are only charged when a task reaches "success".
 */
import { CONCERNS, type Concern, type ConcernScore, type SkinResult } from "../shared/types";

const BASE = "https://yce-api-01.makeupar.com";

export class YouCamError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

async function call(key: string, path: string, init: RequestInit = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...init.headers },
  });
  const body = (await res.json().catch(() => ({}))) as any;
  if (res.status === 401) throw new YouCamError("auth", "The YouCam API key was rejected.", 503);
  if (res.status === 429) throw new YouCamError("rate_limited", "YouCam is busy. Try again in a minute.", 429);
  if (!res.ok || (body.status && body.status !== 200)) {
    throw new YouCamError(body.error_code || "upstream", body.error || `YouCam returned ${res.status}.`, res.status === 404 ? 404 : 502);
  }
  return body.data;
}

/** Upload the image and start a skin-analysis task. Returns the task id. */
export async function startAnalysis(key: string, image: ArrayBuffer, contentType: string): Promise<string> {
  const meta = {
    files: [{ content_type: contentType, file_name: `selfie.${contentType === "image/png" ? "png" : "jpg"}`, file_size: image.byteLength }],
  };
  let data: any;
  try {
    data = await call(key, "/s2s/v2.0/file", { method: "POST", body: JSON.stringify(meta) });
  } catch (e) {
    // Older accounts expose the per-feature file endpoint.
    if (e instanceof YouCamError && e.status === 404) {
      data = await call(key, "/s2s/v2.0/file/skin-analysis", { method: "POST", body: JSON.stringify(meta) });
    } else throw e;
  }
  const file = data?.files?.[0];
  const upload = file?.requests?.[0];
  if (!file?.file_id || !upload?.url) throw new YouCamError("upload", "YouCam did not return an upload address.");

  const put = await fetch(upload.url, { method: upload.method || "PUT", headers: upload.headers, body: image });
  if (!put.ok) throw new YouCamError("upload", "The photo could not be handed to YouCam.");

  const task = await call(key, "/s2s/v2.0/task/skin-analysis", {
    method: "POST",
    body: JSON.stringify({ src_file_id: file.file_id, dst_actions: CONCERNS, format: "json" }),
  });
  if (!task?.task_id) throw new YouCamError("task", "YouCam did not start the analysis.");
  return task.task_id;
}

export type TaskState =
  | { state: "running" }
  | { state: "success"; scores: SkinResult["scores"]; overall?: number; skinAge?: number }
  | { state: "error"; code: string };

export async function pollAnalysis(key: string, taskId: string): Promise<TaskState> {
  const data = await call(key, `/s2s/v2.0/task/skin-analysis/${encodeURIComponent(taskId)}`);
  if (data.task_status === "running") return { state: "running" };
  if (data.task_status === "error") return { state: "error", code: data.error || "unknown_internal_error" };

  // Keep scores only. Mask urls point at images of the face, so they are dropped here.
  const scores: Partial<Record<Concern, ConcernScore>> = {};
  let overall: number | undefined;
  let skinAge: number | undefined;
  for (const o of data.results?.output ?? []) {
    if (o.type === "all") overall = o.score ?? o.raw_score;
    else if (o.type === "skin_age") skinAge = o.score ?? o.raw_score;
    else if ((CONCERNS as readonly string[]).includes(o.type) && (!o.region || o.region === "whole")) {
      if (typeof o.raw_score === "number") scores[o.type as Concern] = { raw: o.raw_score, ui: o.ui_score };
    }
  }
  if (!Object.keys(scores).length) return { state: "error", code: "empty_result" };
  return { state: "success", scores, overall, skinAge };
}

/** Plain-language versions of YouCam's error codes. */
export const ERROR_TEXT: Record<string, string> = {
  error_no_face: "No face was found in this photo.",
  error_src_face_too_small: "The face is too small in the frame.",
  error_src_face_out_of_bound: "Part of the face is cut off at the edge.",
  error_lighting_dark: "The photo is too dark to measure.",
  error_pose: "The face is turned too far from the camera.",
  error_face_parsing: "The face couldn't be mapped, often from hair, hands or glasses in the way.",
  error_below_min_image_size: "The photo resolution is too low.",
  error_exceed_max_image_size: "The photo is too large.",
  exceed_max_filesize: "The photo file is too large.",
  error_nsfw_content_detected: "This photo was declined by YouCam's content filter.",
  error_decode_image: "The photo file couldn't be read.",
  empty_result: "YouCam returned no scores for this photo.",
  unknown_internal_error: "YouCam hit an internal error on this photo.",
};
