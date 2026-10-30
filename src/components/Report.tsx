import { useRef, useState } from "react";
import { CONCERN_LABELS } from "../../shared/types";
import type { Report as R } from "../lib/agent";
import { icsFor, measured } from "../lib/analysis";
import { daysBetween, formatDay } from "../lib/dates";
import type { Photo } from "../lib/types";
import { VERDICT } from "./Charts";
import { Icon } from "./Icon";
import { CheckInRings } from "./Illustrations";

export function Stats({ report, photos }: { report: R; photos: Photo[] }) {
  const m = measured(photos).filter((p) => !p.excluded);
  const span = m.length > 1 ? daysBetween(m[0].date, m[m.length - 1].date) : 0;
  const up = report.findings.filter((f) => f.verdict === "improved").length;
  const down = report.findings.filter((f) => f.verdict === "worsened").length;
  const items = [
    { v: m.length, k: "photos measured" },
    { v: span > 120 ? `${Math.round(span / 30)} mo` : `${span} d`, k: "time covered" },
    { v: up, k: up === 1 ? "concern improved" : "concerns improved" },
    { v: down, k: down === 1 ? "concern worsened" : "concerns worsened" },
  ];
  return (
    <div className="stats">
      {items.map((s, i) => (
        <div className="stat" key={s.k} style={{ animationDelay: `${i * 60}ms` }}>
          <span className="v">{s.v}</span>
          <span className="k">{s.k}</span>
        </div>
      ))}
    </div>
  );
}

export function Summary({ report }: { report: R }) {
  const n = report.narrative;
  const cols = [
    { key: "keep", title: "Keep", icon: "keep", items: n.keep, none: "Nothing lines up with a clear improvement yet." },
    { key: "drop", title: "Reconsider", icon: "drop", items: n.drop, none: "Nothing lines up with getting worse." },
    { key: "test", title: "Test next", icon: "test", items: n.test, none: "Keep photographing in the same conditions." },
  ];
  return (
    <div className="stack">
      {report.worsened.length > 0 && (
        <div className="callout" role="note">
          <span className="ic">
            <Icon name="doctor" />
          </span>
          <div className="stack" style={{ gap: 4 }}>
            <b>Worth showing a dermatologist</b>
            <p className="small">
              {report.worsened.map((f) => CONCERN_LABELS[f.concern]).join(", ")} measured worse over this period. Baseline reports what the camera measured; it can't
              tell you why. A dermatologist can, so bring these charts along rather than reaching for a new product.
            </p>
          </div>
        </div>
      )}
      <div className="report-summary">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="eyebrow">What the measurements say</span>
          <span className="chip" title={n.source === "workers-ai" ? "Every number in the text was checked against the measurements" : "Built directly from the computed findings"}>
            <Icon name={n.source === "workers-ai" ? "check" : "hash"} />
            {n.source === "workers-ai" ? "Workers AI · numbers verified" : "Rule-based"}
          </span>
        </div>
        <p className="big">{n.summary}</p>
      </div>
      <div className="kdt">
        {cols.map((c, i) => (
          <div className="kdt-col" key={c.key} style={{ animationDelay: `${i * 80}ms` }}>
            <h3>
              <Icon name={c.icon} />
              {c.title}
            </h3>
            {c.items.length ? (
              <ul>
                {c.items.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            ) : (
              <p className="none">{c.none}</p>
            )}
          </div>
        ))}
      </div>
      {report.outliers.length > 0 && (
        <div className="callout info">
          <span className="ic">
            <Icon name="eyeOff" />
          </span>
          <div className="stack" style={{ gap: 4 }}>
            <b>
              {report.outliers.length} measurement{report.outliers.length > 1 ? "s" : ""} set aside
            </b>
            <p className="small">
              {report.outliers.map((o) => `${formatDay(o.date)}: ${o.why}`).join(" ")} They stay in the table, struck through, and are left out of the trend.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export function Compare({ report, photos }: { report: R; photos: Photo[] }) {
  const m = measured(photos).filter((p) => !p.excluded);
  const [split, setSplit] = useState(50);
  const box = useRef<HTMLDivElement>(null);
  if (m.length < 2) return null;
  const a = m[0];
  const b = m[m.length - 1];
  const canWipe = Boolean(a.thumb && b.thumb);

  const move = (clientX: number) => {
    const r = box.current!.getBoundingClientRect();
    setSplit(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  };

  return (
    <div className="card pad compare">
      {canWipe ? (
        <div
          ref={box}
          className="wipe"
          style={{ ["--split" as string]: `${split}%` }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            move(e.clientX);
          }}
          onPointerMove={(e) => e.buttons && move(e.clientX)}
          role="slider"
          aria-label="Compare first and latest photo"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(split)}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setSplit((s) => Math.max(0, s - 5));
            if (e.key === "ArrowRight") setSplit((s) => Math.min(100, s + 5));
          }}
        >
          <img src={a.thumb} alt={`First measured photo, ${formatDay(a.date)}`} />
          <img className="after" src={b.thumb} alt={`Latest measured photo, ${formatDay(b.date)}`} />
          <div className="handle">
            <span>
              <Icon name="swap" />
            </span>
          </div>
          <span className="tag" style={{ left: 10 }}>
            {formatDay(a.date, { month: "short", year: "numeric" })}
          </span>
          <span className="tag" style={{ right: 10 }}>
            {formatDay(b.date, { month: "short", year: "numeric" })}
          </span>
        </div>
      ) : (
        <div className="empty" style={{ border: 0, background: "var(--surface-2)" }}>
          <Icon name="lock" />
          <b>Photos weren't kept</b>
          <p>Only the scores were saved from earlier sessions. Add the photos again to compare them side by side; it's free, they're cached.</p>
        </div>
      )}
      <div className="stack">
        <span className="eyebrow">
          First vs latest · {formatDay(a.date)} → {formatDay(b.date)}
        </span>
        <div className="bars">
          {report.findings.map((f) => {
            const lo = Math.min(f.first, f.last);
            const hi = Math.max(f.first, f.last);
            const v = VERDICT[f.verdict];
            return (
              <div className="bar-row" key={f.concern}>
                <span>{CONCERN_LABELS[f.concern]}</span>
                <div className="bar-track" aria-label={`${CONCERN_LABELS[f.concern]}: ${f.first.toFixed(1)} to ${f.last.toFixed(1)}`}>
                  <span className="span" style={{ left: `${lo}%`, width: `${hi - lo}%` }} />
                  <span className="a" style={{ left: `${f.first}%` }} />
                  <span className="b" style={{ left: `${f.last}%` }} />
                </div>
                <span className={`chip ${v.cls}`} style={{ justifySelf: "end" }}>
                  {f.delta >= 0 ? "+" : "−"}
                  {Math.abs(f.delta).toFixed(1)}
                </span>
              </div>
            );
          })}
        </div>
        <p className="small muted">Hollow dot: first photo. Solid dot: latest. Verdicts use the whole trend, not just these two.</p>
      </div>
    </div>
  );
}

export function CheckIn({ report, onCamera }: { report: R; onCamera: () => void }) {
  const c = report.checkIn;
  const download = () => {
    const url = URL.createObjectURL(new Blob([icsFor(c)], { type: "text/calendar" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "baseline-check-in.ics";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const days = daysBetween(new Date().toISOString().slice(0, 10), c.date);
  return (
    <div className="checkin">
      <CheckInRings />
      <div className="stack" style={{ alignContent: "start" }}>
        <span className="eyebrow">
          <Icon name="calendar" /> Next check-in
        </span>
        <div className="when">{formatDay(c.date, { weekday: "short", day: "numeric", month: "long" })}</div>
        <p className="mono small" style={{ opacity: 0.7 }}>
          in {days} days · {formatDay(c.date, { year: "numeric" })}
        </p>
        <p className="why">{c.why}</p>
        <div className="row" style={{ marginTop: 6 }}>
          <button className="btn primary" onClick={download}>
            <Icon name="download" />
            Add to calendar
          </button>
          <button className="btn" onClick={onCamera}>
            <Icon name="camera" />
            Practise the photo
          </button>
        </div>
      </div>
      <div className="stack">
        <h3>The photo to take</h3>
        <ol>
          {c.tips.map((t) => (
            <li key={t.text} className={t.emphasis ? "em" : ""}>
              <span>
                {t.text}
                {t.because && <small>{t.because}</small>}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
