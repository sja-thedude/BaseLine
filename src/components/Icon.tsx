// Small stroke icon set drawn for Baseline (24px grid, 1.75 stroke).
const PATHS: Record<string, string> = {
  upload: "M12 16V4m0 0L7 9m5-5 5 5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3",
  camera: "M4 8.5A2.5 2.5 0 0 1 6.5 6H8l1.5-2h5L16 6h1.5A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5zM12 16a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z",
  monitor: "M4 5h16v11H4zM9 20h6m-3-4v4",
  check: "M5 12.5 10 17 19 7",
  x: "M6 6l12 12M18 6 6 18",
  alert: "M12 9v4m0 3.5v.01M10.3 4.2 2.8 17.5A2 2 0 0 0 4.5 20.5h15a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-10v5m0-8.5v.01",
  calendar: "M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM4 10h16M8 3v4m8-4v4",
  shield: "M12 3 5 6v5.5c0 4.3 2.9 8 7 9.5 4.1-1.5 7-5.2 7-9.5V6zm-3 9 2 2 4-4",
  eye: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  eyeOff: "M3 3l18 18M10.6 6A9.7 9.7 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4M6.5 7.6A16.6 16.6 0 0 0 2.5 12S6 18.5 12 18.5c1.7 0 3.2-.5 4.5-1.2M9.9 9.9a3 3 0 0 0 4.2 4.2",
  trash: "M4 7h16M10 11v6m4-6v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3",
  plus: "M12 5v14M5 12h14",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  spark: "M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5m7 7L18 18M6 18l2.5-2.5m7-7L18 6",
  step: "M12 12m-3 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0",
  decision: "M6 4v6a4 4 0 0 0 4 4h8m0 0-3-3m3 3-3 3M6 20v-2",
  coin: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm3-11.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .9-3 2.1 0 2.8 6 1.6 6 4.4 0 1.3-1.3 2.1-3 2.1-1.4 0-2.6-.6-3.1-1.6M12 6.5v11",
  chart: "M4 4v16h16M8 15l3.5-4 3 2.5L20 7",
  flask: "M9 3h6M10 3v6L4.8 18.1A2 2 0 0 0 6.5 21h11a2 2 0 0 0 1.7-2.9L14 9V3M7.5 15h9",
  keep: "M12 21s-7-4.4-7-10.2A4.3 4.3 0 0 1 12 8a4.3 4.3 0 0 1 7 2.8C19 16.6 12 21 12 21z",
  drop: "M5 12h14",
  test: "M9 3h6M10 3v6L4.8 18.1A2 2 0 0 0 6.5 21h11a2 2 0 0 0 1.7-2.9L14 9V3",
  doctor: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-13v8m-4-4h8",
  download: "M12 4v12m0 0-5-5m5 5 5-5M4 20h16",
  copy: "M8 8h11v12H8zM5 16V4h11",
  swap: "M8 7l-4 5 4 5m8-10 4 5-4 5",
  up: "M12 19V5m0 0-6 6m6-6 6 6",
  down: "M12 5v14m0 0-6-6m6 6 6-6",
  flat: "M5 12h14m-4-4 4 4-4 4",
  table: "M4 5h16v14H4zM4 10h16M4 15h16M10 5v14",
  stop: "M7 7h10v10H7z",
  refresh: "M20 11a8 8 0 0 0-14.8-3.5M4 4v4h4m-4 5a8 8 0 0 0 14.8 3.5M20 20v-4h-4",
  lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  ban: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM5.6 5.6l12.8 12.8",
  hash: "M5 9h14M5 15h14M10 4 8 20m8-16-2 16",
};

export function Icon({ name, title }: { name: keyof typeof PATHS | string; title?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? "img" : undefined}>
      {title && <title>{title}</title>}
      <path d={PATHS[name] ?? PATHS.step} />
    </svg>
  );
}
