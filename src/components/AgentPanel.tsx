import { useEffect, useRef, useState } from "react";
import type { LogEntry, Phase } from "../lib/types";
import { Icon } from "./Icon";
import { AgentIllo } from "./Illustrations";

const PHASES: { k: Phase; label: string }[] = [
  { k: "read", label: "Read" },
  { k: "screen", label: "Screen" },
  { k: "plan", label: "Plan" },
  { k: "measure", label: "Measure" },
  { k: "reason", label: "Reason" },
  { k: "write", label: "Write" },
  { k: "schedule", label: "Next" },
];

const KIND_ICON: Record<LogEntry["kind"], string> = {
  step: "step",
  decision: "decision",
  spend: "coin",
  warn: "alert",
  result: "check",
};

export function AgentPanel({ log, busy, unitsThisSession }: { log: LogEntry[]; busy: boolean; unitsThisSession: number }) {
  const [decisionsOnly, setDecisionsOnly] = useState(false);
  const [copied, setCopied] = useState(false);
  const list = useRef<HTMLOListElement>(null);
  const seen = new Set(log.map((l) => l.phase));
  const current = busy ? log[log.length - 1]?.phase : null;
  const shown = decisionsOnly ? log.filter((l) => l.kind !== "step") : log;
  const decisions = log.filter((l) => l.kind === "decision").length;

  useEffect(() => {
    const el = list.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 160) el.scrollTop = el.scrollHeight;
  }, [log.length]);

  const copy = async () => {
    const text = log.map((l) => `[${l.phase}] ${l.title}${l.detail ? ` — ${l.detail}` : ""}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked; nothing else to do.
    }
  };

  return (
    <aside className="agent" aria-labelledby="agent-title">
      <div className="agent-head">
        <span className="eyebrow">
          <Icon name="spark" /> Agent log
        </span>
        <h2 id="agent-title">How this was worked out</h2>
        <p className="small muted">Every decision the agent made, in order: what it kept, what it set aside, what it spent and why.</p>
      </div>
      <div className="phases" aria-hidden="true">
        {PHASES.map((p) => (
          <div key={p.k} className={current === p.k ? "active" : seen.has(p.k) ? "seen" : ""}>
            <i />
            {p.label}
          </div>
        ))}
      </div>
      {log.length ? (
        <ol className="log" ref={list} aria-live="polite" aria-relevant="additions">
          {shown.map((l) => (
            <li key={l.id} className={l.kind}>
              <span className="k">
                <Icon name={KIND_ICON[l.kind]} />
              </span>
              <div>
                <div className="t">
                  <span className="ph">{l.phase}</span>
                  {l.title}
                </div>
                {l.detail && <div className="d">{l.detail}</div>}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="empty">
          <AgentIllo />
          <b>Waiting for photos</b>
          <p>Add selfies and the agent starts here: dating them, screening each one on your device, then planning what's worth spending units on.</p>
        </div>
      )}
      <div className="agent-foot">
        <span className="mono">
          {decisions} decisions · {unitsThisSession} units spent
        </span>
        <div className="row" style={{ gap: 4 }}>
          <button className="btn sm ghost" aria-pressed={decisionsOnly} onClick={() => setDecisionsOnly(!decisionsOnly)}>
            {decisionsOnly ? "Show all" : "Decisions only"}
          </button>
          <button className="btn sm ghost" onClick={copy} disabled={!log.length}>
            <Icon name={copied ? "check" : "copy"} />
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
    </aside>
  );
}
