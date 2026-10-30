/**
 * The Baseline agent. It works in phases and logs every decision it makes:
 *
 *   read      date each photo (EXIF, then filename, then file date)
 *   screen    on-device checks: face found, size, angle, light, focus. Rescue by cropping where possible
 *   plan      drop duplicates and same-day repeats, use cached results, fit the budget, order the queue
 *   measure   YouCam Skin AI on each queued photo, tracking unit spend
 *   reason    trends per concern vs. noise, before/after shifts around routine events
 *   write     plain-language summary (Workers AI, number-checked; rules as fallback)
 *   schedule  next check-in date and what photo to take
 *
 * Screening happens as photos are added (free). The rest runs on "Measure & analyse".
 */
import { CONCERN_LABELS, UNITS_PER_PHOTO, type Finding, type EventEffect, type ReportResponse, type StatusResponse } from "../../shared/types";
import { ApiError, api } from "./api";
import { daysBetween, formatDay, isoDay, photoDate } from "./dates";
import { detectFaces, loadDetector } from "./face";
import { cropForFace, decode, encode, lightingAndFocus, sha256, thumbnail } from "./image";
import { eventEffects, eventsWithoutData, findOutliers, findings, measured, nextCheckIn, ruleReport, type CheckIn, type Outlier } from "./analysis";
import type { LogEntry, Phase, Photo, RoutineEvent } from "./types";

export interface Report {
  findings: Finding[];
  effects: EventEffect[];
  narrative: ReportResponse;
  checkIn: CheckIn;
  worsened: Finding[];
  outliers: Outlier[];
  builtAt: number;
  eventsKey: string;
  measuredCount: number;
}

/** A plan the agent proposes before spending units; the user approves it. */
export interface Plan {
  queue: Photo[];
  units: number;
  skippedForBudget: number;
  reusedFromCache: number;
}

export interface State {
  photos: Photo[];
  events: RoutineEvent[];
  log: LogEntry[];
  busy: null | "screening" | "running";
  progress: { done: number; total: number } | null;
  unitsThisSession: number;
  status: StatusResponse | null;
  report: Report | null;
  notice: { tone: "info" | "error"; text: string } | null;
  plan: Plan | null;
}

const STORE = "baseline:v1";
const MAX_YAW = 0.32;
const MAX_ROLL = 18;
const MIN_BRIGHTNESS = 70;
const MAX_HIGHLIGHTS = 0.08;
const MIN_SHARPNESS = 55;

let nextId = 1;
const uid = () => `${Date.now().toString(36)}${(nextId++).toString(36)}`;
const pct = (x: number) => `${Math.floor(x * 100)}%`;
const eventsKey = (events: RoutineEvent[]) => JSON.stringify(events.map((e) => [e.date, e.kind, e.label]));

export class Agent {
  state: State = {
    photos: [],
    events: [],
    log: [],
    busy: null,
    progress: null,
    unitsThisSession: 0,
    status: null,
    report: null,
    notice: null,
    plan: null,
  };
  private listeners = new Set<() => void>();
  private screenQueue: Promise<void> = Promise.resolve();
  private stopRequested = false;

  constructor() {
    this.restore();
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getState = () => this.state;

  private set(patch: Partial<State>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  private patchPhoto(id: string, patch: Partial<Photo>) {
    this.set({ photos: this.state.photos.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  }

  private log(phase: Phase, kind: LogEntry["kind"], title: string, detail?: string) {
    this.set({ log: [...this.state.log, { id: nextId++, at: Date.now(), phase, kind, title, detail }] });
  }

  // ---------- persistence: scores, dates and routine only. Never images. ----------

  private persist() {
    const photos = this.state.photos
      .filter((p) => p.status === "measured" && p.result)
      .map(({ id, name, date, dateSource, width, height, hash, result, reasons, screen }) => ({
        id, name, date, dateSource, width, height, hash, result, reasons,
        screen: screen && { ...screen, crop: undefined },
      }));
    try {
      localStorage.setItem(STORE, JSON.stringify({ photos, events: this.state.events }));
    } catch {
      // Storage unavailable (private mode); the session still works.
    }
  }

  private restore() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) || "null");
      if (!saved) return;
      this.state.photos = (saved.photos ?? []).map((p: Photo) => ({ ...p, status: "measured" }));
      this.state.events = saved.events ?? [];
    } catch {
      // Ignore a corrupt or blocked store.
    }
  }

  async refreshStatus() {
    try {
      this.set({ status: await api.status() });
    } catch {
      this.set({ status: null });
    }
  }

  clearAll() {
    this.state.photos.forEach((p) => p.thumb && URL.revokeObjectURL(p.thumb));
    try {
      localStorage.removeItem(STORE);
    } catch {
      // ignore
    }
    this.set({ photos: [], events: [], log: [], report: null, progress: null, notice: null });
  }

  // ---------- routine events ----------

  addEvent(e: Omit<RoutineEvent, "id">) {
    this.set({ events: [...this.state.events, { ...e, id: uid() }].sort((a, b) => a.date.localeCompare(b.date)) });
    this.persist();
  }
  removeEvent(id: string) {
    this.set({ events: this.state.events.filter((e) => e.id !== id) });
    this.persist();
  }

  setDate(id: string, date: string) {
    this.patchPhoto(id, { date, dateSource: "manual" });
    this.persist();
  }

  removePhoto(id: string) {
    const p = this.state.photos.find((x) => x.id === id);
    if (p?.thumb) URL.revokeObjectURL(p.thumb);
    this.set({ photos: this.state.photos.filter((x) => x.id !== id) });
    this.persist();
  }

  /** Bring back a photo the agent discarded; the user has the final say. */
  forceInclude(id: string) {
    const p = this.state.photos.find((x) => x.id === id);
    if (!p?.blob) return;
    this.patchPhoto(id, { status: "ready" });
    this.log("screen", "decision", `${p.name}: included by you`, "Overrode the screening decision. Results from this photo may be noisier.");
  }

  // ---------- read + screen (free, on device) ----------

  addFiles(files: File[]) {
    const images = files.filter((f) => /^image\/(jpeg|png|heic|heif|webp)$/i.test(f.type) || /\.(jpe?g|png|heic|webp)$/i.test(f.name));
    if (!images.length) {
      this.set({ notice: { tone: "error", text: "Those files aren't photos. Choose JPEG or PNG selfies." } });
      return;
    }
    const placeholders: Photo[] = images.map((f) => ({
      id: uid(), name: f.name, date: isoDay(new Date(f.lastModified)), dateSource: "file",
      width: 0, height: 0, status: "screening", reasons: [],
    }));
    this.set({ photos: [...this.state.photos, ...placeholders], notice: null });
    this.screenQueue = this.screenQueue.then(() => this.screenAll(images, placeholders));
  }

  private async screenAll(files: File[], placeholders: Photo[]) {
    this.set({ busy: this.state.busy ?? "screening", progress: { done: 0, total: files.length } });
    this.log("read", "step", `Reading ${files.length} photo${files.length > 1 ? "s" : ""}`, "Dates come from EXIF first, then the filename, then the file's modified date.");
    const detector = await loadDetector();
    if (!detector) {
      this.log("screen", "warn", "On-device face detector unavailable", "Falling back to light and focus checks only; YouCam will still reject photos without a usable face, at no cost.");
    }
    for (let i = 0; i < files.length; i++) {
      await this.screenOne(files[i], placeholders[i].id);
      this.set({ progress: { done: i + 1, total: files.length } });
    }
    const kept = this.state.photos.filter((p) => placeholders.some((x) => x.id === p.id) && p.status === "ready").length;
    this.log("screen", "result", `Screening done: ${kept} of ${files.length} usable`, "Screening runs on your device and costs no API units.");
    if (this.state.busy === "screening") this.set({ busy: null, progress: null });
  }

  private async screenOne(file: File, id: string) {
    const reasons: string[] = [];
    let img: ImageBitmap;
    try {
      img = await decode(file);
    } catch {
      this.patchPhoto(id, { status: "discarded", reasons: ["This file couldn't be opened as an image."] });
      this.log("screen", "decision", `${file.name}: discarded`, "The file couldn't be decoded (HEIC photos may need converting to JPEG first).");
      return;
    }
    const { date, source } = await photoDate(file);
    this.patchPhoto(id, { date, dateSource: source, width: img.width, height: img.height });
    this.log("read", "step", `${file.name}: dated ${formatDay(date)}`, source === "exif" ? "From the camera's EXIF timestamp." : source === "filename" ? "From the date in the filename." : "No EXIF date; used the file's modified date. Check it and correct if needed.");

    const discard = (why: string) => {
      img.close();
      this.patchPhoto(id, { status: "discarded", reasons: [why] });
      this.log("screen", "decision", `${file.name}: discarded`, `${why} Not sent, 0 units spent.`);
    };

    if (Math.min(img.width, img.height) < 480) return discard(`Resolution ${img.width}×${img.height} is below YouCam's 480px minimum.`);

    const faces = await detectFaces(img);
    let crop;
    let faceRatio: number | undefined;
    let yaw: number | undefined;
    let roll: number | undefined;
    if (faces) {
      if (!faces.length) return discard("No face found.");
      const face = faces[0];
      if (faces.length > 1 && faces[1].box.w > face.box.w * 0.6) return discard("More than one face in the photo.");
      if (faces.length > 1) reasons.push("Other faces in the background were cropped out.");
      yaw = face.yaw;
      roll = face.roll;
      if (Math.abs(face.yaw) > MAX_YAW) return discard("Face is turned away from the camera.");
      if (Math.abs(face.roll) > MAX_ROLL) return discard(`Head is tilted about ${Math.round(Math.abs(face.roll))}°.`);
      faceRatio = face.box.w / img.width;
      if (faceRatio < 0.6) {
        crop = cropForFace(img, face.box);
        if (!crop) return discard(`Face fills only ${pct(faceRatio)} of the width and the photo is too small to crop.`);
        reasons.push(`Cropped: face filled ${pct(faceRatio)} of the width, YouCam needs over 60%.`);
      }
    }

    const region = faces?.[0]?.box ?? undefined;
    const light = lightingAndFocus(img, region);
    if (light.brightness < MIN_BRIGHTNESS) return discard("Too dark: the face is underexposed, which skews redness and radiance.");
    if (light.highlights > MAX_HIGHLIGHTS) return discard("Blown-out highlights on the face; texture can't be measured there.");
    if (light.sharpness < MIN_SHARPNESS) return discard("Too soft or blurred to measure pores and texture.");

    // Higher is better: sharp, evenly lit, facing the camera.
    const quality =
      Math.min(1, light.sharpness / 400) * 0.45 +
      (1 - Math.abs(light.brightness - 140) / 140) * 0.35 +
      (yaw == null ? 0.1 : (1 - Math.abs(yaw) / MAX_YAW) * 0.2);

    const blob = await encode(img, crop);
    const hash = await sha256(blob);
    const thumb = await thumbnail(img, crop);
    img.close();

    const dupe = this.state.photos.find((p) => p.id !== id && p.hash === hash);
    if (dupe) {
      this.patchPhoto(id, { status: "duplicate", thumb, hash, reasons: [`Same image as ${dupe.name}.`] });
      this.log("screen", "decision", `${file.name}: duplicate`, `Identical to ${dupe.name}; measuring it again would waste ${UNITS_PER_PHOTO} units.`);
      return;
    }
    this.patchPhoto(id, {
      status: "ready", thumb, hash, blob, reasons,
      screen: { faces: faces?.length ?? null, faceRatio, yaw, roll, ...light, crop, quality },
    });
    this.log(
      "screen",
      "decision",
      `${file.name}: usable${crop ? " after cropping" : ""}`,
      [
        faceRatio != null ? `face ${pct(faceRatio)} of width` : null,
        yaw != null ? `angle ${Math.abs(yaw) < 0.12 ? "frontal" : "slightly turned"}` : null,
        `brightness ${Math.round(light.brightness)}/255`,
        `focus ${Math.round(light.sharpness)}`,
      ].filter(Boolean).join(" · "),
    );
  }

  // ---------- plan → measure → reason → write → schedule ----------

  stop() {
    this.stopRequested = true;
    this.log("measure", "warn", "Stopping after the photos already in flight", "Nothing more will be sent.");
  }

  /** Plan for free, then wait for the user to approve the spend. */
  async propose() {
    await this.screenQueue;
    this.stopRequested = false;
    this.set({ busy: "running", notice: null, progress: null });
    let plan: Plan | null = null;
    try {
      plan = await this.plan();
    } finally {
      this.set({ busy: null });
    }
    if (plan) {
      this.set({ plan });
      this.log("plan", "step", "Waiting for your go-ahead", "Nothing has been sent to YouCam yet.");
    } else await this.finish(() => this.reason());
  }

  async approve() {
    const plan = this.state.plan;
    if (!plan) return;
    this.set({ plan: null });
    this.log("plan", "decision", "Plan approved", `Sending ${plan.queue.length} photo${plan.queue.length > 1 ? "s" : ""} to YouCam Skin AI.`);
    plan.queue.forEach((p) => this.patchPhoto(p.id, { status: "queued" }));
    await this.finish(async () => {
      await this.measure(plan.queue);
      await this.reason();
    });
  }

  cancelPlan() {
    this.set({ plan: null });
    this.log("plan", "step", "Plan cancelled", "No units spent. Photos are still ready to measure.");
  }

  /** Re-run the reasoning on what's already measured (free). */
  reanalyse() {
    return this.finish(() => this.reason());
  }

  private async finish(work: () => Promise<void>) {
    this.set({ busy: "running" });
    try {
      await work();
    } finally {
      this.set({ busy: null, progress: null });
      this.persist();
      this.refreshStatus();
    }
  }

  private async plan(): Promise<Plan | null> {
    const all = this.state.photos;
    let candidates = all.filter((p) => p.status === "ready" && p.hash);
    this.log("plan", "step", `Planning: ${candidates.length} usable photo${candidates.length === 1 ? "" : "s"} not yet measured`);
    if (!candidates.length) return null;

    // 1. Results already cached for this exact image cost nothing.
    let hits = 0;
    for (const p of candidates) {
      const hit = await api.cached(p.hash!).catch(() => null);
      if (hit) {
        hits++;
        this.patchPhoto(p.id, { status: "measured", result: hit, cached: true, blob: undefined });
      }
    }
    if (hits) this.log("plan", "decision", `${hits} already measured before`, `Reused cached scores by image hash: ${hits * UNITS_PER_PHOTO} units saved.`);

    // 2. One measurement per day is enough; keep the best photo from each day.
    candidates = this.state.photos.filter((p) => p.status === "ready" && p.hash);
    const byDay = new Map<string, Photo[]>();
    for (const p of candidates) byDay.set(p.date, [...(byDay.get(p.date) ?? []), p]);
    const measuredDays = new Set(measured(this.state.photos).map((p) => p.date));
    const chosen: Photo[] = [];
    for (const [day, group] of byDay) {
      group.sort((a, b) => (b.screen?.quality ?? 0) - (a.screen?.quality ?? 0));
      if (measuredDays.has(day)) {
        group.forEach((p) => this.patchPhoto(p.id, { status: "skipped", reasons: [...p.reasons, `Already have a measurement for ${formatDay(day)}.`] }));
        this.log("plan", "decision", `${formatDay(day)}: already measured`, `Skipped ${group.length} more photo${group.length > 1 ? "s" : ""} from that day.`);
        continue;
      }
      chosen.push(group[0]);
      if (group.length > 1) {
        group.slice(1).forEach((p) => this.patchPhoto(p.id, { status: "skipped", reasons: [...p.reasons, `Another photo from the same day was clearer.`] }));
        this.log("plan", "decision", `${formatDay(day)}: ${group.length} photos, kept the clearest`, `${group[0].name} had the best focus and light. Skipping the rest saves ${(group.length - 1) * UNITS_PER_PHOTO} units.`);
      }
    }
    if (!chosen.length) return null;

    // 3. Fit the budget, spreading picks across time.
    await this.refreshStatus();
    const s = this.state.status;
    const affordable = s
      ? Math.max(0, Math.min(Math.floor((s.unitsBudget - s.unitsSpent) / s.unitsPerPhoto), s.perVisitorDaily - s.visitorUsedToday))
      : chosen.length;
    if (s && !s.configured) {
      this.log("plan", "warn", "Skin analysis isn't switched on for this deployment", "Cached results still work; new photos can't be measured right now.");
      this.set({ notice: { tone: "error", text: "Skin analysis isn't switched on for this deployment right now. Previously measured photos still work." } });
      return null;
    }
    const order = spreadOrder(chosen.sort((a, b) => a.date.localeCompare(b.date)));
    const queue = order.slice(0, affordable);
    if (queue.length < order.length) {
      order.slice(affordable).forEach((p) => this.patchPhoto(p.id, { status: "skipped", reasons: [...p.reasons, "Over today's analysis budget; the agent chose more evenly spaced photos first."] }));
      this.log(
        "plan",
        "decision",
        `Budget allows ${queue.length} of ${order.length} photos`,
        `${s!.unitsBudget - s!.unitsSpent} shared units left, ${s!.perVisitorDaily - s!.visitorUsedToday} photos left for you today. Picked the most evenly spaced dates so the trend still covers the full span.`,
      );
    }
    if (!queue.length) {
      this.set({ notice: { tone: "error", text: "Today's analysis allowance is used up. Your measured photos and routine still work." } });
      return null;
    }
    if (queue.length > 2) {
      this.log("plan", "decision", `Measuring ${formatDay(queue[0].date)} and ${formatDay(queue[1].date)} first`, "The earliest and latest photos fix the overall change; the rest fill the biggest gaps first, so stopping early still leaves a readable trend.");
    }
    this.log("plan", "spend", `Estimated cost: ${queue.length * UNITS_PER_PHOTO} units`, `${queue.length} photo${queue.length > 1 ? "s" : ""} × ${UNITS_PER_PHOTO} units (YouCam SD skin analysis, 8 concerns). Failed analyses are not charged.`);
    return { queue, units: queue.length * UNITS_PER_PHOTO, skippedForBudget: order.length - queue.length, reusedFromCache: hits };
  }

  private async measure(queue: Photo[]) {
    const total = queue.length;
    let done = 0;
    let halted: string | null = null;
    this.set({ progress: { done, total } });
    const next = [...queue];

    const worker = async () => {
      while (next.length && !halted && !this.stopRequested) {
        const p = next.shift()!;
        const blob = this.state.photos.find((x) => x.id === p.id)?.blob;
        if (!blob) continue;
        this.patchPhoto(p.id, { status: "measuring" });
        try {
          let res = await api.analyze(blob);
          const started = Date.now();
          while (res.status === "running") {
            if (Date.now() - started > 150_000) throw new ApiError("timeout", "YouCam took too long on this photo.", 504);
            await new Promise((r) => setTimeout(r, 3000));
            res = await api.task(res.taskId);
          }
          if (res.status === "done") {
            this.patchPhoto(p.id, { status: "measured", result: res.result, cached: res.cached, blob: undefined });
            this.set({ unitsThisSession: this.state.unitsThisSession + res.unitsCharged });
            this.log("measure", res.unitsCharged ? "spend" : "result", `${p.name}: measured`, res.unitsCharged ? `−${res.unitsCharged} units · ${this.state.unitsThisSession} spent this session` : "Cached result, 0 units.");
          } else {
            this.patchPhoto(p.id, { status: "failed", error: res.message, blob: undefined });
            this.log("measure", "warn", `${p.name}: YouCam couldn't measure it`, `${res.message} Excluded from the chart. Not charged.`);
          }
        } catch (e) {
          const err = e instanceof ApiError ? e : new ApiError("error", "Unexpected error.", 0);
          if (["budget", "visitor_limit", "not_configured", "auth"].includes(err.code)) {
            halted = err.message;
            this.patchPhoto(p.id, { status: "skipped", reasons: [...p.reasons, err.message] });
          } else {
            this.patchPhoto(p.id, { status: "failed", error: err.message });
            this.log("measure", "warn", `${p.name}: not measured`, `${err.message} Excluded from the chart.`);
          }
        }
        this.set({ progress: { done: ++done, total } });
        this.persist();
      }
    };
    await Promise.all([worker(), worker()]);
    for (const p of next) this.patchPhoto(p.id, { status: "ready" });
    if (halted) {
      this.log("measure", "warn", "Measuring stopped", halted);
      this.set({ notice: { tone: "error", text: halted } });
    }
  }

  private async reason() {
    // Outliers: clear earlier calls, then look again with everything measured so far.
    this.set({ photos: this.state.photos.map((p) => (p.excluded ? { ...p, excluded: undefined } : p)) });
    const outliers: Outlier[] = findOutliers(this.state.photos);
    for (const o of outliers) {
      this.patchPhoto(o.photoId, { excluded: o.why });
      this.log("reason", "decision", `${o.name} (${formatDay(o.date)}) set aside as an outlier`, o.why);
    }
    if (!outliers.length && measured(this.state.photos).length >= 5) {
      this.log("reason", "step", "No outliers", "No photo jumped away from the trend on several concerns at once.");
    }

    const m = measured(this.state.photos).filter((p) => !p.excluded);
    if (m.length < 2) {
      this.log("reason", "warn", "Not enough measurements to compare", "Add at least two usable photos taken a few weeks apart.");
      return;
    }
    const span = daysBetween(m[0].date, m[m.length - 1].date);
    this.set({ busy: "running" });
    this.log("reason", "step", `Comparing ${m.length} measurements over ${span} days`, "Using YouCam's raw scores, not the flattering ui_score. Each concern gets a straight-line trend; a change only counts if it beats the photo-to-photo noise.");

    const found = findings(this.state.photos);
    for (const f of found) {
      this.log(
        "reason",
        "result",
        `${CONCERN_LABELS[f.concern]}: ${f.verdict}`,
        `${f.first.toFixed(1)} → ${f.last.toFixed(1)} across ${f.points} photos · trend ${f.slopePerMonth >= 0 ? "+" : ""}${f.slopePerMonth.toFixed(1)}/month · noise ±${f.noise.toFixed(1)}`,
      );
    }
    const { kept, checked } = eventEffects(this.state.photos, this.state.events, found);
    for (const e of eventsWithoutData(this.state.photos, this.state.events)) {
      this.log("reason", "warn", `"${e.label}": not enough photos around it`, "Needs at least one photo before it and one taken four or more weeks after.");
    }
    for (const e of kept) {
      this.log("reason", "decision", `"${e.label}" lines up with ${e.shift > 0 ? "better" : "worse"} ${CONCERN_LABELS[e.concern].toLowerCase()}`, `Average ${e.before.toFixed(1)} before (${e.beforeN} photos) vs ${e.after.toFixed(1)} from four weeks after (${e.afterN}). Lined up in time; not proof of cause.`);
    }
    if (checked.length) {
      this.log("reason", "step", `${checked.length} event/concern pairs showed no real shift`, checked.slice(0, 6).map((c) => `${c.event.label} × ${CONCERN_LABELS[c.concern]}: ${c.shift >= 0 ? "+" : ""}${c.shift.toFixed(1)}, ${c.why}`).join("; "));
    }
    const worsened = found.filter((f) => f.verdict === "worsened");
    if (worsened.length) {
      this.log("reason", "warn", "Something measured worse", `${worsened.map((f) => CONCERN_LABELS[f.concern]).join(", ")}. Baseline points you to a dermatologist for this, not to a product.`);
    }

    // Write: model first, every number checked against the computed findings.
    let narrative: ReportResponse;
    const rules = ruleReport(found, kept, this.state.events, this.state.photos);
    const request = {
      spanDays: span,
      photos: m.length,
      findings: found,
      effects: kept,
      events: this.state.events.map(({ label, date, kind }) => ({ label, date, kind })),
      evidence: { keep: rules.keep, drop: rules.drop },
    };
    try {
      narrative = await api.report(request);
      this.log("write", "result", "Summary written by Workers AI", `${narrative.model}. Checked: every number matches a measurement, and every keep/drop matches the agent's evidence.`);
    } catch (e) {
      narrative = rules;
      const err = e as ApiError;
      const detail = Array.isArray(err.detail) ? (err.detail as string[]).join("; ") : "";
      this.log(
        "write",
        "warn",
        err.code === "unverified_numbers" || err.code === "unsupported_advice" ? "Model summary rejected" : "Language model unavailable",
        err.code === "unverified_numbers"
          ? `It quoted ${detail}, which isn't in the measurements. Used the rule-based summary instead.`
          : err.code === "unsupported_advice"
            ? `It recommended something the evidence doesn't support${detail ? ` ("${detail}")` : ""}. Used the rule-based summary instead.`
            : "Used the rule-based summary built directly from the findings.",
      );
    }

    const checkIn = nextCheckIn(this.state.photos, this.state.events, isoDay(new Date()));
    this.log("schedule", "decision", `Next check-in: ${formatDay(checkIn.date)}`, checkIn.why);
    const emphasised = checkIn.tips.filter((t) => t.because);
    if (emphasised.length) this.log("schedule", "step", "Photo advice tailored to your set", emphasised.map((t) => t.because).join(" "));

    this.set({
      report: {
        findings: found, effects: kept, narrative, checkIn, worsened, outliers,
        builtAt: Date.now(), eventsKey: eventsKey(this.state.events), measuredCount: measured(this.state.photos).length,
      },
    });
  }

  isReportStale() {
    const r = this.state.report;
    return Boolean(r && (r.eventsKey !== eventsKey(this.state.events) || r.measuredCount !== measured(this.state.photos).length));
  }
}

/** Earliest and latest first, then repeatedly the photo farthest from everything already picked. */
export function spreadOrder(sorted: Photo[]): Photo[] {
  if (sorted.length <= 2) return sorted;
  const picked = [sorted[0], sorted[sorted.length - 1]];
  const rest = sorted.slice(1, -1);
  while (rest.length) {
    let best = 0;
    let bestGap = -1;
    rest.forEach((p, i) => {
      const gap = Math.min(...picked.map((q) => Math.abs(daysBetween(p.date, q.date))));
      if (gap > bestGap) {
        bestGap = gap;
        best = i;
      }
    });
    picked.push(rest.splice(best, 1)[0]);
  }
  return picked;
}

export const agent = new Agent();
