// Self-drawn illustrations. Colours come from CSS tokens so both themes work.
// Faces are abstract shapes: no real people anywhere in the product imagery.

function Face({ x, y, s = 1, tone = "var(--surface-3)" }: { x: number; y: number; s?: number; tone?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M-34 70c4-22 18-32 34-32s30 10 34 32" fill="var(--line-strong)" />
      <ellipse cx="0" cy="0" rx="26" ry="32" fill={tone} />
      <path d="M-27-6c2-22 14-30 27-30s25 8 27 30c-6-12-16-16-27-16S-21-18-27-6z" fill="var(--ink-3)" opacity=".55" />
      <circle cx="-9" cy="2" r="2.2" fill="var(--ink-2)" />
      <circle cx="9" cy="2" r="2.2" fill="var(--ink-2)" />
      <path d="M-6 16q6 4 12 0" stroke="var(--ink-2)" strokeWidth="2" fill="none" strokeLinecap="round" />
    </g>
  );
}

function Polaroid({ x, y, r, date, tone, cls }: { x: number; y: number; r: number; date: string; tone?: string; cls?: string }) {
  return (
    <g className={cls}>
      <g transform={`translate(${x} ${y}) rotate(${r})`}>
        <rect x="-70" y="-82" width="140" height="172" rx="8" fill="var(--surface)" stroke="var(--line)" />
        <rect x="-60" y="-72" width="120" height="124" rx="4" fill="var(--surface-2)" />
        <clipPath id={`clip-${date}`}>
          <rect x="-60" y="-72" width="120" height="124" rx="4" />
        </clipPath>
        <g clipPath={`url(#clip-${date})`}>
          <Face x={0} y={-6} s={1.25} tone={tone} />
        </g>
        <text x="0" y="74" textAnchor="middle" fontFamily="var(--mono)" fontSize="11" fill="var(--ink-3)">
          {date}
        </text>
      </g>
    </g>
  );
}

export function HeroArt() {
  const pts = [
    [72, 412],
    [152, 400],
    [232, 405],
    [312, 378],
    [392, 362],
    [470, 338],
  ];
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
  return (
    <svg viewBox="0 0 540 490" role="img" aria-labelledby="hero-title">
      <title id="hero-title">Three dated selfies from a camera roll, with a measured skin score rising across them</title>
      <circle cx="300" cy="210" r="190" fill="var(--accent-soft)" opacity=".55" />
      <circle cx="300" cy="210" r="130" fill="none" stroke="var(--accent-line)" strokeDasharray="2 6" />
      <Polaroid cls="float-b" x={150} y={190} r={-9} date="MAR 2024" tone="#d9b8a3" />
      <Polaroid cls="float-c" x={390} y={180} r={8} date="OCT 2026" tone="#e6c7b1" />
      <Polaroid cls="float-a" x={270} y={150} r={-1} date="SEP 2025" tone="#dfbea9" />
      {/* the measured line */}
      <g>
        <rect x="40" y="276" width="460" height="170" rx="16" fill="var(--surface)" stroke="var(--line)" />
        <text x="62" y="304" fontFamily="var(--mono)" fontSize="11" letterSpacing="1.5" fill="var(--ink-3)">
          TEXTURE · RAW SCORE
        </text>
        <text x="478" y="304" textAnchor="end" fontFamily="var(--mono)" fontSize="13" fontWeight="600" fill="var(--good)">
          ↑ improving
        </text>
        {[330, 370, 410].map((y) => (
          <line key={y} x1="62" x2="478" y1={y} y2={y} stroke="var(--chart-grid)" />
        ))}
        <line x1="270" x2="270" y1="318" y2="420" stroke="var(--accent)" strokeDasharray="3 3" />
        <circle cx="270" cy="318" r="9" fill="var(--accent)" />
        <text x="270" y="321.5" textAnchor="middle" fontFamily="var(--mono)" fontSize="10" fontWeight="600" fill="var(--accent-ink)">
          1
        </text>
        <path d={d} pathLength={1} className="draw" fill="none" stroke="var(--chart-line)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="5" fill="var(--chart-line)" stroke="var(--surface)" strokeWidth="2.5" className="pop" style={{ animationDelay: `${0.5 + i * 0.28}s` }} />
        ))}
        <text x="284" y="436" fontFamily="var(--sans)" fontSize="11.5" fill="var(--ink-2)">
          started retinol
        </text>
      </g>
    </svg>
  );
}

export function PhotosIllo({ className = "illo" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 240 150" aria-hidden="true">
      <g transform="rotate(-8 80 80)">
        <rect x="30" y="22" width="90" height="110" rx="8" fill="var(--surface)" stroke="var(--line-strong)" />
        <rect x="38" y="30" width="74" height="74" rx="4" fill="var(--surface-2)" />
        <circle cx="75" cy="62" r="14" fill="var(--surface-3)" />
        <path d="M52 104c4-14 12-20 23-20s19 6 23 20" fill="var(--surface-3)" />
      </g>
      <g transform="rotate(7 160 80)">
        <rect x="118" y="20" width="90" height="110" rx="8" fill="var(--surface)" stroke="var(--line-strong)" />
        <rect x="126" y="28" width="74" height="74" rx="4" fill="var(--surface-2)" />
        <circle cx="163" cy="60" r="14" fill="var(--surface-3)" />
        <path d="M140 102c4-14 12-20 23-20s19 6 23 20" fill="var(--surface-3)" />
      </g>
      <circle cx="120" cy="112" r="22" fill="var(--accent)" />
      <path d="M120 102v20m-10-10h20" stroke="var(--accent-ink)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function RoutineIllo() {
  return (
    <svg className="illo" viewBox="0 0 240 140" aria-hidden="true">
      <line x1="20" x2="220" y1="96" y2="96" stroke="var(--line-strong)" strokeWidth="2" />
      {[50, 110, 170].map((x, i) => (
        <g key={x}>
          <line x1={x} x2={x} y1="40" y2="96" stroke="var(--accent)" strokeDasharray="3 4" opacity={0.8 - i * 0.2} />
          <circle cx={x} cy="96" r="7" fill={i === 1 ? "var(--surface-3)" : "var(--accent)"} stroke="var(--surface)" strokeWidth="3" />
        </g>
      ))}
      <g transform="translate(38 14)">
        <rect width="30" height="44" rx="6" fill="var(--surface)" stroke="var(--line-strong)" />
        <rect x="8" y="-6" width="14" height="8" rx="2" fill="var(--ink-3)" />
        <rect x="6" y="14" width="18" height="16" rx="3" fill="var(--accent-soft)" />
      </g>
      <g transform="translate(150 22)">
        <path d="M20 0c10 14 16 22 16 30a16 16 0 0 1-32 0c0-8 6-16 16-30z" fill="var(--accent-soft)" stroke="var(--accent-line)" />
      </g>
      <text x="20" y="124" fontFamily="var(--mono)" fontSize="10" fill="var(--ink-3)">JAN</text>
      <text x="200" y="124" fontFamily="var(--mono)" fontSize="10" fill="var(--ink-3)">JUN</text>
    </svg>
  );
}

export function ChartIllo() {
  return (
    <svg className="illo" viewBox="0 0 240 140" aria-hidden="true">
      <rect x="10" y="10" width="220" height="120" rx="14" fill="var(--surface-2)" />
      {[45, 75, 105].map((y) => (
        <line key={y} x1="28" x2="212" y1={y} y2={y} stroke="var(--chart-grid)" />
      ))}
      <path d="M30 98 L70 90 L110 94 L150 70 L190 56" fill="none" stroke="var(--ink-3)" strokeWidth="2.5" strokeDasharray="6 6" strokeLinecap="round" />
      {[
        [30, 98],
        [70, 90],
        [110, 94],
        [150, 70],
        [190, 56],
      ].map(([x, y]) => (
        <circle key={x} cx={x} cy={y} r="5" fill="var(--surface)" stroke="var(--ink-3)" strokeWidth="2" />
      ))}
      <circle cx="190" cy="56" r="14" fill="none" stroke="var(--accent)" strokeWidth="2" opacity=".6" />
    </svg>
  );
}

export function AgentIllo() {
  return (
    <svg className="illo" viewBox="0 0 240 130" aria-hidden="true">
      {[
        [40, 30],
        [120, 30],
        [200, 30],
        [80, 96],
        [160, 96],
      ].map(([x, y], i) => (
        <g key={i}>
          <rect x={x - 26} y={y - 16} width="52" height="32" rx="10" fill={i === 2 ? "var(--accent-soft)" : "var(--surface-2)"} stroke={i === 2 ? "var(--accent-line)" : "var(--line-strong)"} />
          <rect x={x - 14} y={y - 3} width="28" height="6" rx="3" fill={i === 2 ? "var(--accent)" : "var(--ink-3)"} opacity=".6" />
        </g>
      ))}
      <path d="M66 30h28M146 30h28M200 46c0 30-14 50-40 50M134 96h-28M80 80c0-24 14-34 40-34" fill="none" stroke="var(--line-strong)" strokeWidth="2" strokeDasharray="3 4" />
    </svg>
  );
}

export function PrivacyIllo() {
  return (
    <svg className="illo" viewBox="0 0 260 200" aria-hidden="true">
      <circle cx="130" cy="100" r="88" fill="var(--surface)" stroke="var(--line)" />
      <g transform="translate(76 46)">
        <rect width="108" height="128" rx="10" fill="var(--surface-2)" stroke="var(--line-strong)" />
        <clipPath id="pv">
          <rect width="108" height="128" rx="10" />
        </clipPath>
        <g clipPath="url(#pv)" opacity=".5">
          <Face x={54} y={58} s={1.2} />
        </g>
        <path d="M-8 64h124" stroke="var(--accent)" strokeWidth="2" strokeDasharray="4 4" />
      </g>
      <g transform="translate(150 118)">
        <path d="M24 0 4 8v14c0 12 8 22 20 26 12-4 20-14 20-26V8z" fill="var(--good-soft)" stroke="var(--good)" strokeWidth="2" />
        <path d="M15 24l6 6 11-12" stroke="var(--good)" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <text x="30" y="40" fontFamily="var(--mono)" fontSize="10" fill="var(--ink-3)">sha256</text>
      <text x="30" y="54" fontFamily="var(--mono)" fontSize="10" fill="var(--ink-3)">9f2c…e41a</text>
    </svg>
  );
}

export function CheckInRings() {
  return (
    <svg className="rings" viewBox="0 0 200 200" aria-hidden="true">
      {[30, 55, 80, 98].map((r) => (
        <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="currentColor" strokeWidth="1.5" />
      ))}
    </svg>
  );
}

export function Logo() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--ink)" />
      <path d="M7 21.5 12 17l4 2.5 4-6 5 3" fill="none" stroke="var(--bg)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="7" x2="25" y1="24.5" y2="24.5" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
