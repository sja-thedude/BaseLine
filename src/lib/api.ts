import type { AnalyzeResponse, ReportRequest, ReportResponse, SkinResult, StatusResponse } from "../../shared/types";

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public detail?: unknown,
  ) {
    super(message);
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError("offline", "Couldn't reach Baseline. Check your connection.", 0);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error || "error", body.message || `Request failed (${res.status}).`, res.status, body.detail);
  return body as T;
}

export const api = {
  status: () => req<StatusResponse>("/api/status"),
  cached: (hash: string) => req<SkinResult | null>(`/api/cache/${hash}`),
  analyze: (blob: Blob) => req<AnalyzeResponse>("/api/analyze", { method: "POST", body: blob, headers: { "Content-Type": "image/jpeg" } }),
  task: (id: string) => req<AnalyzeResponse>(`/api/task/${encodeURIComponent(id)}`),
  report: (body: ReportRequest) =>
    req<ReportResponse>("/api/report", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
};
