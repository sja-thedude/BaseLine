// Types shared by the browser app and the worker.

/** SD skin concerns Baseline tracks. Eight concerns is one YouCam pricing tier (5–8). */
export const CONCERNS = [
  "wrinkle",
  "pore",
  "texture",
  "redness",
  "dark_circle_v2",
  "acne",
  "radiance",
  "moisture",
] as const;

export type Concern = (typeof CONCERNS)[number];

/** Units YouCam charges for one SD analysis of 5–8 concerns. */
export const UNITS_PER_PHOTO = 12;

export const CONCERN_LABELS: Record<Concern, string> = {
  wrinkle: "Wrinkles",
  pore: "Pores",
  texture: "Texture",
  redness: "Redness",
  dark_circle_v2: "Dark circles",
  acne: "Acne",
  radiance: "Radiance",
  moisture: "Moisture",
};

/** One concern as measured by YouCam. Higher is healthier on both scales. */
export interface ConcernScore {
  raw: number;
  ui: number;
}

/** What Baseline keeps about a photo: scores only, keyed by the image hash. */
export interface SkinResult {
  hash: string;
  scores: Partial<Record<Concern, ConcernScore>>;
  overall?: number;
  skinAge?: number;
  measuredAt: string;
}

export type AnalyzeResponse =
  | { status: "done"; cached: boolean; result: SkinResult; unitsCharged: number }
  | { status: "running"; taskId: string; hash: string }
  | { status: "failed"; code: string; message: string; unitsCharged: 0 };

export interface StatusResponse {
  configured: boolean;
  unitsSpent: number;
  unitsBudget: number;
  unitsPerPhoto: number;
  perVisitorDaily: number;
  visitorUsedToday: number;
}

/** A finding the agent computed from measurements; the narrative may only explain these. */
export interface Finding {
  concern: Concern;
  first: number;
  last: number;
  delta: number;
  slopePerMonth: number;
  noise: number;
  verdict: "improved" | "worsened" | "steady" | "unclear";
  points: number;
}

export interface EventEffect {
  eventId: string;
  label: string;
  date: string;
  concern: Concern;
  before: number;
  after: number;
  shift: number;
  beforeN: number;
  afterN: number;
}

export interface ReportRequest {
  spanDays: number;
  photos: number;
  findings: Finding[];
  effects: EventEffect[];
  events: { label: string; date: string; kind: "start" | "stop" | "note" }[];
  /** Keep/drop conclusions the agent's rules already support; the model may only rephrase these. */
  evidence: { keep: string[]; drop: string[] };
}

export interface ReportResponse {
  source: "workers-ai" | "rules";
  model?: string;
  summary: string;
  keep: string[];
  drop: string[];
  test: string[];
}
