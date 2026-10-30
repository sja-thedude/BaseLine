import { useEffect, useRef } from "react";
import { agent, type Plan } from "../lib/agent";
import { formatDay } from "../lib/dates";
import type { StatusResponse } from "../../shared/types";
import { Icon } from "./Icon";

export function useDialog(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("[data-autofocus], button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
      if (e.key === "Tab" && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>("button, input, [href], [tabindex]:not([tabindex='-1'])");
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          last.focus();
          e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === last) {
          first.focus();
          e.preventDefault();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prev?.focus();
    };
  }, []);
  return ref;
}

export function PlanSheet({ plan, status }: { plan: Plan; status: StatusResponse | null }) {
  const close = () => agent.cancelPlan();
  const ref = useDialog(close);
  const left = status ? status.unitsBudget - status.unitsSpent : null;
  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="sheet" ref={ref} role="dialog" aria-modal="true" aria-labelledby="plan-title">
        <div className="stack" style={{ gap: 8 }}>
          <span className="eyebrow">
            <Icon name="decision" /> The agent's plan
          </span>
          <h2 id="plan-title" style={{ fontSize: "1.7rem" }}>
            Measure {plan.queue.length} photo{plan.queue.length > 1 ? "s" : ""}?
          </h2>
          <p className="muted">In this order. The earliest and latest go first so the overall change is known even if you stop early.</p>
        </div>
        <div className="queue">
          {plan.queue.map((p, i) => (
            <figure key={p.id} style={{ animationDelay: `${i * 40}ms` }}>
              <div className="q-img">
                {p.thumb && <img src={p.thumb} alt={`Photo ${i + 1}, ${formatDay(p.date)}`} />}
                <span className="n">{i + 1}</span>
              </div>
              <figcaption>{formatDay(p.date, { month: "short", year: "2-digit" })}</figcaption>
            </figure>
          ))}
        </div>
        <div className="cost">
          <div>
            <b>{plan.units}</b>
            <span>units at most</span>
          </div>
          <div>
            <b>{plan.reusedFromCache}</b>
            <span>reused, 0 units</span>
          </div>
          <div>
            <b>{left ?? "–"}</b>
            <span>shared units left</span>
          </div>
        </div>
        {plan.skippedForBudget > 0 && (
          <p className="small muted">
            {plan.skippedForBudget} more photo{plan.skippedForBudget > 1 ? "s" : ""} would go over today's allowance, so the agent picked the most evenly spaced dates.
          </p>
        )}
        <p className="small muted">
          <Icon name="lock" /> Each photo goes once to YouCam Skin AI, then is discarded. Only the scores come back. Failed analyses are not charged.
        </p>
        <div className="sheet-actions">
          <button className="btn ghost" onClick={close}>
            Not now
          </button>
          <button className="btn primary lg" data-autofocus onClick={() => agent.approve()}>
            Approve and measure
            <Icon name="arrow" />
          </button>
        </div>
      </div>
    </div>
  );
}
