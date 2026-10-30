import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CONCERNS, CONCERN_LABELS, type Concern, type Finding } from "../../shared/types";
import { formatDay } from "../lib/dates";
import type { Photo, RoutineEvent } from "../lib/types";
import { Icon } from "./Icon";

const H = 150;
const M = { t: 18, r: 10, b: 22, l: 30 };

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(320);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const t = (iso: string) => Date.parse(iso);

export const VERDICT: Record<Finding["verdict"], { label: string; cls: string; icon: string }> = {
  improved: { label: "Improved", cls: "good", icon: "up" },
  worsened: { label: "Worsened", cls: "bad", icon: "down" },
  steady: { label: "Steady", cls: "", icon: "flat" },
  unclear: { label: "Too early", cls: "warn", icon: "info" },
};

interface Pt {
  x: number;
  y: number;
  value: number;
  date: string;
  out: boolean;
  name: string;
}

function ConcernChart({
  concern,
  photos,
  events,
  domain,
  finding,
  delay,
}: {
  concern: Concern;
  photos: Photo[];
  events: RoutineEvent[];
  domain: [number, number];
  finding?: Finding;
  delay: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const data = photos.filter((p) => p.result?.scores[concern]);
  const values = data.map((p) => p.result!.scores[concern]!.raw);
  const lo = Math.max(0, Math.floor((Math.min(...values) - 6) / 5) * 5);
  const hi = Math.min(100, Math.ceil((Math.max(...values) + 6) / 5) * 5);
  const span = Math.max(1, domain[1] - domain[0]);
  const x = (iso: string) => M.l + ((t(iso) - domain[0]) / span) * (width - M.l - M.r);
  const y = (v: number) => M.t + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - M.t - M.b);

  const pts: Pt[] = data.map((p) => ({
    x: x(p.date),
    y: y(p.result!.scores[concern]!.raw),
    value: p.result!.scores[concern]!.raw,
    date: p.date,
    out: Boolean(p.excluded),
    name: p.name,
  }));
  const inPts = pts.filter((p) => !p.out);
  const line = inPts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

  // Trend line with a ±noise band, from the same fit the agent used.
  let trend: { x1: number; y1: number; x2: number; y2: number } | null = null;
  let band = "";
  if (finding && inPts.length >= 2) {
    const first = inPts[0];
    const last = inPts[inPts.length - 1];
    const days = (t(last.date) - t(first.date)) / 86_400_000;
    const mean = inPts.reduce((a, p) => a + p.value, 0) / inPts.length;
    const meanDay = inPts.reduce((a, p) => a + (t(p.date) - t(first.date)) / 86_400_000, 0) / inPts.length;
    const slope = finding.slopePerMonth / 30;
    const v1 = mean + slope * (0 - meanDay);
    const v2 = mean + slope * (days - meanDay);
    trend = { x1: first.x, y1: y(v1), x2: last.x, y2: y(v2) };
    const n = Math.max(finding.noise, 1);
    band = `M${first.x} ${y(v1 + n)} L${last.x} ${y(v2 + n)} L${last.x} ${y(v2 - n)} L${first.x} ${y(v1 - n)} Z`;
  }

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    let best = -1;
    let bd = Infinity;
    pts.forEach((p, i) => {
      const d = Math.abs(p.x - mx);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    setHover(bd < 60 ? best : null);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (!pts.length) return;
    if (e.key === "ArrowRight") setHover((h) => (h == null ? 0 : Math.min(pts.length - 1, h + 1)));
    else if (e.key === "ArrowLeft") setHover((h) => (h == null ? pts.length - 1 : Math.max(0, h - 1)));
    else if (e.key === "Escape") setHover(null);
    else return;
    e.preventDefault();
  };

  const v = finding ? VERDICT[finding.verdict] : null;
  const ticks = [lo, (lo + hi) / 2, hi];
  const hp = hover != null ? pts[hover] : null;
  const sortedEvents = events.map((e, i) => ({ ...e, n: i + 1 })).filter((e) => t(e.date) >= domain[0] && t(e.date) <= domain[1]);
  const delta = finding?.delta;

  return (
    <div className="chart-card" style={{ animationDelay: `${delay}ms` }}>
      <header>
        <div className="row" style={{ gap: 8 }}>
          <h3>{CONCERN_LABELS[concern]}</h3>
          {v && (
            <span className={`chip ${v.cls}`}>
              <Icon name={v.icon} />
              {v.label}
            </span>
          )}
        </div>
        {delta != null && (
          <span className="delta" title="Latest measured score minus first measured score">
            {delta >= 0 ? "+" : "−"}
            {Math.abs(delta).toFixed(1)}
          </span>
        )}
      </header>
      <div ref={ref} style={{ position: "relative" }}>
        <svg
          className="chart-svg"
          viewBox={`0 0 ${width} ${H}`}
          height={H}
          role="img"
          tabIndex={0}
          aria-label={`${CONCERN_LABELS[concern]} raw score over time, ${pts.length} measurements${v ? `, ${v.label.toLowerCase()}` : ""}. Use arrow keys to step through points.`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          onKeyDown={onKey}
          onBlur={() => setHover(null)}
        >
          {ticks.map((tk) => (
            <g key={tk}>
              <line className="grid" x1={M.l} x2={width - M.r} y1={y(tk)} y2={y(tk)} />
              <text className="axis-label" x={M.l - 6} y={y(tk) + 3.5} textAnchor="end">
                {Math.round(tk)}
              </text>
            </g>
          ))}
          <text className="axis-label" x={M.l} y={H - 4}>
            {formatDay(new Date(domain[0]).toISOString().slice(0, 10), { month: "short", year: "2-digit" })}
          </text>
          <text className="axis-label" x={width - M.r} y={H - 4} textAnchor="end">
            {formatDay(new Date(domain[1]).toISOString().slice(0, 10), { month: "short", year: "2-digit" })}
          </text>
          {band && <path className="band" d={band} />}
          {trend && <line className="trend" {...trend} />}
          {sortedEvents.map((e) => (
            <g key={e.id}>
              <line className="ev" x1={x(e.date)} x2={x(e.date)} y1={M.t - 4} y2={H - M.b} />
              <circle className="ev-badge" cx={x(e.date)} cy={M.t - 8} r={7.5} />
              <text className="ev-num" x={x(e.date)} y={M.t - 4.7} textAnchor="middle">
                {e.n}
              </text>
            </g>
          ))}
          {line && <path key={line} className="line anim-line" d={line} pathLength={1} style={{ animationDelay: `${delay + 150}ms` }} />}
          {hp && <line className="cross" x1={hp.x} x2={hp.x} y1={M.t} y2={H - M.b} />}
          {pts.map((p, i) => (
            <circle key={i} className={`pt ${p.out ? "out" : ""}`} cx={p.x} cy={p.y} r={hover === i ? 6.5 : 4.5} />
          ))}
        </svg>
        {hp && (
          <div className="tooltip" style={{ left: Math.min(Math.max(hp.x, 70), width - 70), top: hp.y }}>
            <div className="mono">{hp.value.toFixed(1)}</div>
            <div>{formatDay(hp.date)}</div>
            {hp.out && <div style={{ opacity: 0.75 }}>Set aside as outlier</div>}
          </div>
        )}
      </div>
    </div>
  );
}

export function Charts({ photos, events, findings }: { photos: Photo[]; events: RoutineEvent[]; findings: Finding[] }) {
  const [table, setTable] = useState(false);
  const measured = useMemo(() => photos.filter((p) => p.status === "measured" && p.result).sort((a, b) => a.date.localeCompare(b.date)), [photos]);
  const dates = [...measured.map((p) => t(p.date)), ...events.map((e) => t(e.date))];
  const pad = 86_400_000 * 6;
  const domain: [number, number] = [Math.min(...dates) - pad, Math.max(...dates) + pad];
  const shown = CONCERNS.filter((c) => measured.some((p) => p.result!.scores[c]));

  useEffect(() => {
    // Keep the table choice for this visitor.
    try {
      setTable(localStorage.getItem("baseline:table") === "1");
    } catch {
      // ignore
    }
  }, []);
  const toggle = () => {
    setTable(!table);
    try {
      localStorage.setItem("baseline:table", table ? "0" : "1");
    } catch {
      // ignore
    }
  };

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <p className="small muted">
          YouCam raw scores, 1–100, higher is healthier. Dashed line: trend. Shaded: photo-to-photo noise.
        </p>
        <button className="btn sm ghost" onClick={toggle} aria-pressed={table}>
          <Icon name={table ? "chart" : "table"} />
          {table ? "Show charts" : "Show table"}
        </button>
      </div>
      {table ? (
        <div className="data-table-wrap">
          <table className="data-table">
            <caption className="sr-only">Raw scores for each measured photo</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                {shown.map((c) => (
                  <th key={c} scope="col">
                    {CONCERN_LABELS[c]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {measured.map((p) => (
                <tr key={p.id} className={p.excluded ? "out" : ""} title={p.excluded}>
                  <td>{formatDay(p.date)}</td>
                  {shown.map((c) => (
                    <td key={c}>{p.result!.scores[c]?.raw.toFixed(1) ?? "–"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="chart-grid">
          {shown.map((c, i) => (
            <ConcernChart key={c} concern={c} photos={measured} events={events} domain={domain} finding={findings.find((f) => f.concern === c)} delay={i * 70} />
          ))}
        </div>
      )}
    </div>
  );
}
