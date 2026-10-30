import { useEffect, useState, useSyncExternalStore } from "react";
import { agent } from "./lib/agent";
import { measured } from "./lib/analysis";
import { UNITS_PER_PHOTO } from "../shared/types";
import { Icon } from "./components/Icon";
import { ChartIllo, HeroArt, Logo, PrivacyIllo } from "./components/Illustrations";
import { DropZone, PhotoGrid } from "./components/Photos";
import { Routine } from "./components/Routine";
import { Charts } from "./components/Charts";
import { CheckIn, Compare, Stats, Summary } from "./components/Report";
import { AgentPanel } from "./components/AgentPanel";
import { PlanSheet } from "./components/PlanSheet";
import { CameraSheet } from "./components/Camera";

type Theme = "system" | "light" | "dark";

function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem("baseline:theme") as Theme) || "system";
    } catch {
      return "system";
    }
  });
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("baseline:theme", theme);
    } catch {
      // ignore
    }
  }, [theme]);
  const next = () => setTheme(theme === "system" ? "light" : theme === "light" ? "dark" : "system");
  return [theme, next] as const;
}

function useScrolled() {
  const [s, set] = useState(false);
  useEffect(() => {
    const on = () => set(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return s;
}

function useReveal(dep: unknown) {
  useEffect(() => {
    const io = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }),
      { rootMargin: "0px 0px -8% 0px" },
    );
    document.querySelectorAll(".reveal:not(.in)").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [dep]);
}

const HOW = [
  { icon: "upload", t: "Upload old selfies", d: "Your camera roll already holds your baseline. Dates come from the photo itself." },
  { icon: "eye", t: "Agent screens them", d: "On your device: face, angle, light, focus. Bad photos never cost a unit." },
  { icon: "chart", t: "YouCam measures", d: "Eight skin concerns per photo with YouCam Skin AI, plotted over real time." },
  { icon: "decision", t: "See what worked", d: "Changes lined up against your routine, with what to keep, drop or test next." },
];

export default function App() {
  const s = useSyncExternalStore(agent.subscribe, agent.getState);
  const [theme, nextTheme] = useTheme();
  const scrolled = useScrolled();
  const [camera, setCamera] = useState(false);
  useReveal(s.report?.builtAt);

  useEffect(() => {
    agent.refreshStatus();
  }, []);

  const m = measured(s.photos);
  const ready = s.photos.filter((p) => p.status === "ready").length;
  const stale = agent.isReportStale();
  const busy = s.busy !== null;
  const status = s.status;
  const left = status ? Math.max(0, status.unitsBudget - status.unitsSpent) : null;
  const progressPct = s.progress ? (s.progress.done / Math.max(1, s.progress.total)) * 100 : 0;

  const go = () => {
    document.getElementById("photos")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <>
      <a href="#main" className="sr-only">
        Skip to content
      </a>
      <header className={`header ${scrolled ? "scrolled" : ""}`}>
        <div className="wrap">
          <a className="brand" href="#top" aria-label="Baseline, back to top">
            <Logo />
            Baseline
          </a>
          <div className="header-actions">
            {left != null && (
              <span className="budget-pill" title="Shared YouCam units left for this demo">
                <span className="meter">
                  <i style={{ width: `${(left / status!.unitsBudget) * 100}%` }} />
                </span>
                {left} units left
              </span>
            )}
            <button className="btn ghost icon-btn" onClick={nextTheme} aria-label={`Theme: ${theme}. Switch theme`} title={`Theme: ${theme}`}>
              <Icon name={theme === "dark" ? "moon" : theme === "light" ? "sun" : "monitor"} />
            </button>
          </div>
        </div>
        {busy && <span className="topbar-progress" style={{ width: s.progress ? `${progressPct}%` : "30%" }} />}
      </header>

      <main id="main">
        <section className="hero" id="top">
          <div className="wrap hero-grid">
            <div className="hero-copy">
              <span className="eyebrow">
                <span className="num">●</span> Retroactive skincare tracking
              </span>
              <h1>
                Your camera roll is <em>your baseline.</em>
              </h1>
              <p className="lede">
                Upload the selfies you already have. Baseline measures your skin in each one with YouCam Skin AI, plots what changed and when, and shows which routine changes
                line up with it.
              </p>
              <div className="hero-cta">
                <button className="btn primary lg" onClick={go}>
                  Start with your photos
                  <Icon name="arrow" />
                </button>
                <button className="btn lg" onClick={() => setCamera(true)}>
                  <Icon name="camera" />
                  Take today's photo
                </button>
              </div>
              <div className="trust">
                <span>
                  <Icon name="shield" /> Photos never stored
                </span>
                <span>
                  <Icon name="lock" /> No account
                </span>
                <span>
                  <Icon name="check" /> Not medical advice
                </span>
              </div>
            </div>
            <div className="hero-art">
              <HeroArt />
            </div>
          </div>
          <div className="wrap">
            <div className="how">
              {HOW.map((h) => (
                <div className="how-card" key={h.t}>
                  <span className="ic">
                    <Icon name={h.icon} />
                  </span>
                  <b>{h.t}</b>
                  <p>{h.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="wrap layout">
          <div>
            {s.notice && (
              <div className={`notice ${s.notice.tone === "info" ? "info" : ""}`} role="alert" style={{ marginTop: 32 }}>
                <Icon name={s.notice.tone === "info" ? "info" : "alert"} />
                <span>{s.notice.text}</span>
              </div>
            )}

            <section className="section" id="photos" aria-labelledby="photos-title">
              <div className="section-head">
                <div>
                  <span className="eyebrow">
                    <span className="num">01</span> Photos
                  </span>
                  <h2 id="photos-title">Your selfies, on a timeline</h2>
                  <p className="muted">Check the dates. Photos without EXIF use the file date, so fix any that look wrong.</p>
                </div>
                {s.photos.length > 0 && (
                  <button className="btn sm ghost" onClick={() => confirm("Remove all photos, scores and routine events from this device?") && agent.clearAll()}>
                    <Icon name="trash" />
                    Clear all
                  </button>
                )}
              </div>
              <div className="stack">
                <DropZone onCamera={() => setCamera(true)} compact={s.photos.length > 0} />
                {s.photos.length > 0 && <PhotoGrid photos={s.photos} />}
              </div>
            </section>

            <section className="section" id="routine" aria-labelledby="routine-title">
              <div className="section-head">
                <div>
                  <span className="eyebrow">
                    <span className="num">02</span> Routine
                  </span>
                  <h2 id="routine-title">What you changed, and when</h2>
                  <p className="muted">Approximate dates are fine. The agent waits four weeks after each change before counting its effect.</p>
                </div>
              </div>
              <Routine events={s.events} />
            </section>

            {(ready > 0 || busy || m.length >= 2) && (
              <div className="runbar no-print">
                <div className="txt" style={{ flex: "1 1 220px" }}>
                  {busy ? (
                    <>
                      <b>{s.busy === "screening" ? "Screening photos on your device" : s.progress ? `Measuring ${s.progress.done} of ${s.progress.total}` : "Working it out"}</b>
                      <span className="progress" style={{ marginTop: 6 }}>
                        <i style={{ width: `${s.progress ? progressPct : 35}%` }} />
                      </span>
                    </>
                  ) : ready > 0 ? (
                    <>
                      <b>
                        {ready} photo{ready > 1 ? "s" : ""} ready
                      </b>
                      <span>Up to {ready * UNITS_PER_PHOTO} units. You approve the plan first.</span>
                    </>
                  ) : (
                    <>
                      <b>{stale ? "Routine or photos changed" : "Analysis is up to date"}</b>
                      <span>Re-running the reasoning is free.</span>
                    </>
                  )}
                </div>
                {busy && s.progress && s.busy === "running" ? (
                  <button className="btn" onClick={() => agent.stop()}>
                    <Icon name="stop" />
                    Stop
                  </button>
                ) : ready > 0 ? (
                  <button className="btn primary lg" disabled={busy} onClick={() => agent.propose()}>
                    Measure and analyse
                    <Icon name="arrow" />
                  </button>
                ) : (
                  <button className={`btn ${stale ? "primary" : ""}`} disabled={busy} onClick={() => agent.reanalyse()}>
                    <Icon name="refresh" />
                    Re-analyse
                  </button>
                )}
              </div>
            )}

            <section className="section" id="results" aria-labelledby="results-title">
              <div className="section-head">
                <div>
                  <span className="eyebrow">
                    <span className="num">03</span> What changed
                  </span>
                  <h2 id="results-title">Measured, not remembered</h2>
                </div>
                {s.report && (
                  <button className="btn sm ghost no-print" onClick={() => window.print()}>
                    <Icon name="download" />
                    Save as PDF
                  </button>
                )}
              </div>
              {s.report && m.length >= 2 ? (
                <div className="stack" style={{ gap: 28 }}>
                  <Stats report={s.report} photos={s.photos} />
                  <div className="reveal">
                    <Summary report={s.report} />
                  </div>
                  <div className="reveal">
                    <Charts photos={s.photos} events={s.events} findings={s.report.findings} />
                  </div>
                  <div className="reveal">
                    <Compare report={s.report} photos={s.photos} />
                  </div>
                </div>
              ) : (
                <div className="empty">
                  <ChartIllo />
                  <b>{m.length === 1 ? "One measurement so far" : "Your charts appear here"}</b>
                  <p>
                    {m.length === 1
                      ? "Add a photo from a different month to see a trend."
                      : "Add at least two selfies taken weeks or months apart, then press Measure and analyse."}
                  </p>
                </div>
              )}
            </section>

            {s.report && m.length >= 2 && (
              <section className="section reveal" id="next" aria-labelledby="next-title">
                <div className="section-head">
                  <div>
                    <span className="eyebrow">
                      <span className="num">04</span> Next check-in
                    </span>
                    <h2 id="next-title">Keep the baseline going</h2>
                  </div>
                </div>
                <CheckIn report={s.report} onCamera={() => setCamera(true)} />
              </section>
            )}
          </div>

          <div className="section" style={{ paddingTop: 56 }}>
            <AgentPanel log={s.log} busy={busy} unitsThisSession={s.unitsThisSession} />
          </div>
        </div>

        <section className="wrap section reveal" id="privacy" aria-labelledby="privacy-title">
          <div className="privacy">
            <div className="stack">
              <span className="eyebrow">
                <Icon name="shield" /> Privacy
              </span>
              <h2 id="privacy-title">
                Your face is <em>not</em> the product.
              </h2>
              <p className="muted">For an app that asks for years of selfies, this is the promise.</p>
              <PrivacyIllo />
            </div>
            <ul>
              <li>
                <span className="ic">
                  <Icon name="ban" />
                </span>
                <span>
                  <b>Photos are not stored, not logged, not used for training.</b>
                  Each photo is sent once to YouCam Skin AI (Perfect Corp) to be measured and then discarded by Baseline. Request bodies are never logged.
                </span>
              </li>
              <li>
                <span className="ic">
                  <Icon name="hash" />
                </span>
                <span>
                  <b>Only scores are kept, keyed by a one-way hash.</b>
                  The SHA-256 of an image lets a repeat upload reuse its scores without the image ever being saved.
                </span>
              </li>
              <li>
                <span className="ic">
                  <Icon name="eye" />
                </span>
                <span>
                  <b>Screening happens on your device.</b>
                  Face, angle, light and focus checks run in your browser. Photos that fail are never uploaded.
                </span>
              </li>
              <li>
                <span className="ic">
                  <Icon name="lock" />
                </span>
                <span>
                  <b>Location data is stripped, and there's no account.</b>
                  Photos are re-encoded before upload, which removes EXIF and GPS. Your timeline stays in this browser until you clear it.
                </span>
              </li>
            </ul>
          </div>
        </section>
      </main>

      <footer className="site">
        <div className="wrap">
          <a className="brand" href="#top">
            <Logo />
            Baseline
          </a>
          <p>
            Baseline reports what YouCam Skin AI measured in your photos and how those measurements changed. It is not medical or dermatological advice and does not diagnose
            anything. If something is getting worse, see a dermatologist.
          </p>
          <p>Skin measurements by YouCam Skin AI from Perfect Corp. Summaries by Cloudflare Workers AI, checked against the measurements. Illustrations drawn for Baseline.</p>
        </div>
      </footer>

      {s.plan && <PlanSheet plan={s.plan} status={s.status} />}
      {camera && <CameraSheet onClose={() => setCamera(false)} />}
    </>
  );
}
