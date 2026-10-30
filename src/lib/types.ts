import type { SkinResult } from "../../shared/types";
import type { DateSource } from "./dates";
import type { Box } from "./image";

export type PhotoStatus =
  | "screening"
  | "ready"
  | "discarded"
  | "duplicate"
  | "skipped"
  | "queued"
  | "measuring"
  | "measured"
  | "failed";

export interface Screen {
  faces: number | null;
  faceRatio?: number;
  yaw?: number;
  roll?: number;
  brightness: number;
  highlights: number;
  sharpness: number;
  crop?: Box;
  quality: number;
}

export interface Photo {
  id: string;
  name: string;
  date: string;
  dateSource: DateSource;
  width: number;
  height: number;
  status: PhotoStatus;
  reasons: string[];
  thumb?: string;
  screen?: Screen;
  hash?: string;
  /** Prepared JPEG, held in memory only until it has been measured. */
  blob?: Blob;
  result?: SkinResult;
  error?: string;
  cached?: boolean;
  /** Set when the agent sets a measurement aside as an outlier. */
  excluded?: string;
}

export interface RoutineEvent {
  id: string;
  label: string;
  date: string;
  kind: "start" | "stop" | "note";
}

export type Phase = "read" | "screen" | "plan" | "measure" | "reason" | "write" | "schedule";

export interface LogEntry {
  id: number;
  at: number;
  phase: Phase;
  kind: "step" | "decision" | "spend" | "warn" | "result";
  title: string;
  detail?: string;
}
