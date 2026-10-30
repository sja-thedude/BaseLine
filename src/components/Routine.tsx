import { useState } from "react";
import { agent } from "../lib/agent";
import { formatDay, isoDay } from "../lib/dates";
import type { RoutineEvent } from "../lib/types";
import { Icon } from "./Icon";
import { RoutineIllo } from "./Illustrations";

const IDEAS = ["Started retinol", "Stopped exfoliating acid", "New moisturiser", "Started daily SPF", "Switched cleanser", "Moved to a dry climate"];
const KINDS: { k: RoutineEvent["kind"]; label: string }[] = [
  { k: "start", label: "Started" },
  { k: "stop", label: "Stopped" },
  { k: "note", label: "Note" },
];

export function Routine({ events }: { events: RoutineEvent[] }) {
  const [label, setLabel] = useState("");
  const [date, setDate] = useState(isoDay(new Date()));
  const [kind, setKind] = useState<RoutineEvent["kind"]>("start");
  const [error, setError] = useState("");

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return setError("Say what changed, for example “started retinol”.");
    if (!date) return setError("Pick the date it changed. An approximate month is fine.");
    agent.addEvent({ label: label.trim().slice(0, 80), date, kind });
    setLabel("");
    setError("");
  };

  return (
    <div className="card pad stack">
      <form className="event-form" onSubmit={add} noValidate>
        <label className="field">
          What changed
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Started retinol 0.3%" maxLength={80} />
        </label>
        <label className="field">
          When
          <input className="input" type="date" value={date} max={isoDay(new Date())} onChange={(e) => setDate(e.target.value)} />
        </label>
        <div className="field">
          <span id="kind-label">Type</span>
          <div className="segmented" role="group" aria-labelledby="kind-label">
            {KINDS.map(({ k, label: l }) => (
              <button type="button" key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <button className="btn primary" type="submit">
          <Icon name="plus" />
          Add
        </button>
      </form>
      {error && (
        <p className="small" role="alert" style={{ color: "var(--bad)" }}>
          {error}
        </p>
      )}
      <div className="suggestions" aria-label="Suggestions">
        {IDEAS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setLabel(s);
              setKind(/^stopped/i.test(s) ? "stop" : /^moved/i.test(s) ? "note" : "start");
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {events.length ? (
        <ol className="timeline" aria-label="Routine timeline">
          {events.map((e, i) => (
            <li key={e.id}>
              <span className={`dot ${e.kind}`} aria-hidden="true">
                {i + 1}
              </span>
              <div>
                <b>{e.label}</b>
                <div className="small muted">
                  {KINDS.find((k) => k.k === e.kind)!.label} · {formatDay(e.date)}
                </div>
              </div>
              <button className="btn ghost icon-btn" aria-label={`Remove ${e.label}`} onClick={() => agent.removeEvent(e.id)}>
                <Icon name="trash" />
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <div className="empty" style={{ border: 0, padding: "20px 8px 4px" }}>
          <RoutineIllo />
          <b>No routine changes yet</b>
          <p>Add when you started or stopped something. The agent lines each change up against your measurements to see what moved after it.</p>
        </div>
      )}
    </div>
  );
}
