// Live check-in capture. The on-device face detector coaches the person into the
// same framing every time (centred, close, level, well lit), which is what makes
// one photo comparable with the next.
import { useEffect, useRef, useState } from "react";
import { agent } from "../lib/agent";
import { detectFaces, loadDetector } from "../lib/face";
import { lightingAndFocus } from "../lib/image";
import { Icon } from "./Icon";
import { useDialog } from "./PlanSheet";

interface Check {
  face: boolean;
  close: boolean;
  level: boolean;
  frontal: boolean;
  light: boolean;
}

const COACH: [keyof Check, string, string][] = [
  ["face", "Face the camera", "Face found"],
  ["close", "Move closer", "Close enough"],
  ["frontal", "Look straight ahead", "Facing camera"],
  ["level", "Level your head", "Level"],
  ["light", "Find brighter, even light", "Good light"],
];

export function CameraSheet({ onClose }: { onClose: () => void }) {
  const ref = useDialog(onClose);
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const [check, setCheck] = useState<Check | null>(null);
  const [detector, setDetector] = useState<"loading" | "ready" | "none">("loading");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    let alive = true;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1440 }, height: { ideal: 1920 } }, audio: false });
      } catch {
        setError("The camera couldn't be opened. Allow camera access in your browser, or upload a photo instead.");
        return;
      }
      if (!alive) return stream.getTracks().forEach((t) => t.stop());
      video.current!.srcObject = stream;
      await video.current!.play().catch(() => undefined);
      const d = await loadDetector();
      setDetector(d ? "ready" : "none");
      let inFlight = false;
      const tick = async () => {
        const v = video.current;
        if (!alive || !v || v.readyState < 2 || inFlight) return;
        inFlight = true;
        const frame = await createImageBitmap(v);
        const faces = d ? await detectFaces(frame) : null;
        const f = faces?.[0];
        const light = lightingAndFocus(frame, f?.box);
        setCheck({
          face: Boolean(f) || !d,
          close: f ? f.box.w / frame.width > 0.42 : !d,
          frontal: f ? Math.abs(f.yaw) < 0.2 : !d,
          level: f ? Math.abs(f.roll) < 8 : !d,
          light: light.brightness > 85 && light.highlights < 0.06,
        });
        frame.close();
        inFlight = false;
      };
      timer = window.setInterval(tick, 350);
    })();
    return () => {
      alive = false;
      clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const ready = check && Object.values(check).every(Boolean);
  const next = check && COACH.find(([k]) => !check[k]);

  const capture = () => {
    const v = video.current!;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext("2d")!;
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(v, 0, 0);
    c.toBlob(
      (b) => {
        if (!b) return;
        const d = new Date();
        const name = `checkin-${d.toISOString().slice(0, 10)}.jpg`;
        agent.addFiles([new File([b], name, { type: "image/jpeg", lastModified: d.getTime() })]);
        onClose();
      },
      "image/jpeg",
      0.92,
    );
  };

  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" ref={ref} role="dialog" aria-modal="true" aria-labelledby="cam-title">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="stack" style={{ gap: 4 }}>
            <span className="eyebrow">
              <Icon name="camera" /> Check-in photo
            </span>
            <h2 id="cam-title" style={{ fontSize: "1.5rem" }}>
              Line up your face in the oval
            </h2>
          </div>
          <button className="btn ghost icon-btn" aria-label="Close camera" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        {error ? (
          <div className="notice" role="alert">
            <Icon name="alert" />
            <span>{error}</span>
          </div>
        ) : (
          <div className={`camera ${ready ? "ready" : ""}`}>
            <video ref={video} playsInline muted aria-label="Live camera preview" />
            <svg className="guide" viewBox="0 0 300 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
              <ellipse cx="150" cy="185" rx="92" ry="124" />
            </svg>
            <div className="coach" aria-live="polite">
              {detector === "loading" ? "Starting face guide…" : ready ? "Hold still, looks good" : next ? next[1] : "Looking for your face…"}
            </div>
          </div>
        )}
        {check && (
          <div className="checks" aria-label="Photo checks">
            {COACH.map(([k, todo, done]) => (
              <span key={k} className={`chip ${check[k] ? "good" : ""}`}>
                <Icon name={check[k] ? "check" : "step"} />
                {check[k] ? done : todo}
              </span>
            ))}
          </div>
        )}
        <p className="small muted">The guide runs on your device. Nothing is sent until you approve the agent's plan.</p>
        <div className="sheet-actions">
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary lg" onClick={capture} disabled={!!error || !check}>
            <Icon name="camera" />
            {ready ? "Take photo" : "Take anyway"}
          </button>
        </div>
      </div>
    </div>
  );
}
