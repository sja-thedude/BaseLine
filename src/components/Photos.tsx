import { useRef, useState } from "react";
import { CONCERNS } from "../../shared/types";
import { agent } from "../lib/agent";
import type { Photo, PhotoStatus } from "../lib/types";
import { Icon } from "./Icon";
import { PhotosIllo } from "./Illustrations";

const STATUS: Record<PhotoStatus, { label: string; cls: string }> = {
  screening: { label: "Screening", cls: "" },
  ready: { label: "Ready", cls: "accent" },
  discarded: { label: "Set aside", cls: "warn" },
  duplicate: { label: "Duplicate", cls: "" },
  skipped: { label: "Skipped", cls: "" },
  queued: { label: "Queued", cls: "accent" },
  measuring: { label: "Measuring", cls: "accent" },
  measured: { label: "Measured", cls: "good" },
  failed: { label: "Not measured", cls: "bad" },
};

const SOURCE: Record<Photo["dateSource"], string> = {
  exif: "EXIF date",
  filename: "From filename",
  file: "File date, check",
  manual: "Set by you",
};

type Filter = "all" | "usable" | "aside";
const isAside = (p: Photo) => ["discarded", "duplicate", "skipped", "failed"].includes(p.status);

export function DropZone({ onCamera, compact = false }: { onCamera: () => void; compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      className={`dropzone ${over ? "over" : ""} ${compact ? "compact" : ""}`}
      onClick={() => input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        agent.addFiles([...e.dataTransfer.files]);
      }}
    >
      <PhotosIllo />
      <div style={{ display: "grid", gap: 4 }}>
        <b style={{ fontFamily: "var(--serif)", fontWeight: 500, fontSize: compact ? "1.05rem" : "1.3rem" }}>
          {compact ? "Add more photos" : "Drop in selfies you already have"}
        </b>
        <span className="small muted">
          {compact ? "More dates make a clearer trend." : "Front-facing photos from different months work best. Ten to thirty is plenty."}
        </span>
      </div>
      <div className="actions" onClick={(e) => e.stopPropagation()}>
        <button className="btn primary" onClick={() => input.current?.click()}>
          <Icon name="upload" />
          Choose photos
        </button>
        <button className="btn" onClick={onCamera}>
          <Icon name="camera" />
          Take one now
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        multiple
        hidden
        onChange={(e) => {
          agent.addFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function PhotoCard({ p, i }: { p: Photo; i: number }) {
  const s = STATUS[p.status];
  const dim = isAside(p);
  const reason = p.error ?? p.excluded ?? p.reasons[p.reasons.length - 1];
  return (
    <article className={`photo ${dim ? "dim" : ""}`} style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}>
      <div className="frame">
        {p.status === "screening" ? (
          <div className="skeleton" style={{ position: "absolute", inset: 0 }} />
        ) : p.thumb ? (
          <img src={p.thumb} alt={`Selfie from ${p.date}`} loading="lazy" />
        ) : (
          <div className="placeholder" title="Only the scores were kept, not the photo">
            <Icon name="lock" />
            Scores only
          </div>
        )}
        {p.status === "measuring" && <div className="scan" aria-hidden="true" />}
        <span className={`chip badge ${s.cls}`}>
          {p.status === "measured" && <Icon name="check" />}
          {p.excluded ? "Outlier" : p.cached && p.status === "measured" ? "Cached" : s.label}
        </span>
        <button className="remove" aria-label={`Remove ${p.name}`} onClick={() => agent.removePhoto(p.id)}>
          <Icon name="x" />
        </button>
      </div>
      <div className="meta">
        {p.status === "screening" ? (
          <>
            <div className="skeleton sk-line" style={{ width: "70%" }} />
            <div className="skeleton sk-line" style={{ width: "45%" }} />
          </>
        ) : (
          <>
            <label className="sr-only" htmlFor={`d-${p.id}`}>
              Date of {p.name}
            </label>
            <input
              id={`d-${p.id}`}
              className="date-input"
              type="date"
              value={p.date}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => e.target.value && agent.setDate(p.id, e.target.value)}
            />
            <span className={`chip ${p.dateSource === "file" ? "warn" : ""}`} style={{ justifySelf: "start" }}>
              {SOURCE[p.dateSource]}
            </span>
            {p.status === "measured" && p.result && (
              <div className="score-strip" aria-hidden="true">
                {CONCERNS.map((c, j) => (
                  <i key={c} style={{ height: `${p.result!.scores[c]?.raw ?? 0}%`, animationDelay: `${j * 40}ms` }} />
                ))}
              </div>
            )}
            {reason && <p className="reason">{reason}</p>}
            {p.status === "skipped" && p.blob && (
              <button className="btn sm ghost" style={{ justifySelf: "start", marginLeft: -10 }} onClick={() => agent.forceInclude(p.id)}>
                Measure anyway
              </button>
            )}
          </>
        )}
      </div>
    </article>
  );
}

export function PhotoGrid({ photos }: { photos: Photo[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const usable = photos.filter((p) => !isAside(p));
  const aside = photos.filter(isAside);
  const list = (filter === "usable" ? usable : filter === "aside" ? aside : photos).slice().sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div className="stack">
      <div className="tabs" role="group" aria-label="Filter photos">
        {(
          [
            ["all", "All", photos.length],
            ["usable", "Usable", usable.length],
            ["aside", "Set aside", aside.length],
          ] as const
        ).map(([k, label, n]) => (
          <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>
            {label}
            <span className="count">{n}</span>
          </button>
        ))}
      </div>
      {list.length ? (
        <div className="photo-grid">
          {list.map((p, i) => (
            <PhotoCard key={p.id} p={p} i={i} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <Icon name="check" />
          <p>{filter === "aside" ? "Nothing set aside. Every photo passed screening." : "No usable photos yet."}</p>
        </div>
      )}
    </div>
  );
}
