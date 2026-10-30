// One real Skin AI call, end to end, to confirm the key and the API flow.
//   YOUCAM_API_KEY=... node scripts/youcam-smoke.mjs path/to/selfie.jpg
// (or put YOUCAM_API_KEY in .dev.vars). Costs 12 units on success, nothing on error.
import { readFileSync, existsSync } from "node:fs";

const BASE = "https://yce-api-01.makeupar.com";
const CONCERNS = ["wrinkle", "pore", "texture", "redness", "dark_circle_v2", "acne", "radiance", "moisture"];

let key = process.env.YOUCAM_API_KEY;
if (!key && existsSync(".dev.vars")) {
  key = readFileSync(".dev.vars", "utf8").match(/^YOUCAM_API_KEY\s*=\s*"?([^"\n]+)"?/m)?.[1];
}
const path = process.argv[2];
if (!key || !path) {
  console.error("Usage: YOUCAM_API_KEY=... node scripts/youcam-smoke.mjs selfie.jpg");
  process.exit(1);
}

const image = readFileSync(path);
const type = path.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

async function api(p, init = {}) {
  const res = await fetch(BASE + p, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  console.log(init.method || "GET", p, res.status);
  if (!res.ok) throw new Error(JSON.stringify(body));
  return body.data;
}

const meta = JSON.stringify({ files: [{ content_type: type, file_name: "selfie.jpg", file_size: image.length }] });
let file;
try {
  file = (await api("/s2s/v2.0/file", { method: "POST", body: meta })).files[0];
} catch (e) {
  console.log("Falling back to /s2s/v2.0/file/skin-analysis:", e.message);
  file = (await api("/s2s/v2.0/file/skin-analysis", { method: "POST", body: meta })).files[0];
}
const up = file.requests[0];
const put = await fetch(up.url, { method: up.method || "PUT", headers: up.headers, body: image });
console.log("PUT upload", put.status);

const { task_id } = await api("/s2s/v2.0/task/skin-analysis", {
  method: "POST",
  body: JSON.stringify({ src_file_id: file.file_id, dst_actions: CONCERNS, format: "json" }),
});

for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const d = await api(`/s2s/v2.0/task/skin-analysis/${encodeURIComponent(task_id)}`);
  if (d.task_status === "running") continue;
  if (d.task_status === "error") {
    console.error("Task error:", d.error, d.error_message || "");
    process.exit(2);
  }
  for (const o of d.results.output) {
    console.log(o.type.padEnd(16), o.region ?? "", "raw", o.raw_score ?? o.score, "ui", o.ui_score ?? "");
  }
  process.exit(0);
}
console.error("Timed out waiting for the task.");
process.exit(3);
