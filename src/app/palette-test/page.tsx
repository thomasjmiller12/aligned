"use client";

const SIZE = 280;
const CENTER_X = SIZE / 2;
const CENTER_Y = SIZE - 24;
const RADIUS = SIZE / 2 - 32;

function degToRad(deg: number): number {
  return ((180 - deg) * Math.PI) / 180;
}

function posOnArc(deg: number, r: number): { x: number; y: number } {
  const rad = degToRad(deg);
  return {
    x: CENTER_X + r * Math.cos(rad),
    y: CENTER_Y - r * Math.abs(Math.sin(rad)),
  };
}

interface PaletteOption {
  name: string;
  description: string;
  arcGradient: [string, string, string];
  zones: { label: string; color: string; from: number; to: number }[];
  scoreColors: { pts: number; color: string }[];
}

const palettes: PaletteOption[] = [
  {
    name: "Current",
    description: "Yellow / Blue / Gray — the blue feels disconnected from the warm arc",
    arcGradient: ["#F4A261", "#E8553A", "#2A9D8F"],
    zones: [
      { label: "4pt", color: "#FFD639", from: -4, to: 4 },
      { label: "3pt", color: "#007CBE", from: -12, to: -4 },
      { label: "3pt", color: "#007CBE", from: 4, to: 12 },
      { label: "2pt", color: "#9CA3AF", from: -20, to: -12 },
      { label: "2pt", color: "#9CA3AF", from: 12, to: 20 },
    ],
    scoreColors: [
      { pts: 4, color: "#FFD700" },
      { pts: 3, color: "#FF9800" },
      { pts: 2, color: "#FF7043" },
    ],
  },
  {
    name: "A: Warm Harmony",
    description: "Gold → Amber → Peach — all warm tones that flow naturally from the arc",
    arcGradient: ["#F4A261", "#E8553A", "#2A9D8F"],
    zones: [
      { label: "4pt", color: "#FBBF24", from: -4, to: 4 },
      { label: "3pt", color: "#F97316", from: -12, to: -4 },
      { label: "3pt", color: "#F97316", from: 4, to: 12 },
      { label: "2pt", color: "#FDBA74", from: -20, to: -12 },
      { label: "2pt", color: "#FDBA74", from: 12, to: 20 },
    ],
    scoreColors: [
      { pts: 4, color: "#FBBF24" },
      { pts: 3, color: "#F97316" },
      { pts: 2, color: "#FDBA74" },
    ],
  },
  {
    name: "B: Teal Cascade",
    description: "Gold center → Teal gradient — ties the scoring to the arc's teal endpoint",
    arcGradient: ["#F4A261", "#E8553A", "#2A9D8F"],
    zones: [
      { label: "4pt", color: "#FBBF24", from: -4, to: 4 },
      { label: "3pt", color: "#2DD4BF", from: -12, to: -4 },
      { label: "3pt", color: "#2DD4BF", from: 4, to: 12 },
      { label: "2pt", color: "#A7F3D0", from: -20, to: -12 },
      { label: "2pt", color: "#A7F3D0", from: 12, to: 20 },
    ],
    scoreColors: [
      { pts: 4, color: "#FBBF24" },
      { pts: 3, color: "#2DD4BF" },
      { pts: 2, color: "#A7F3D0" },
    ],
  },
  {
    name: "C: Sunset Fade",
    description: "Hot pink center → Coral → Sand — vibrant gradient that pops on the warm background",
    arcGradient: ["#F4A261", "#E8553A", "#2A9D8F"],
    zones: [
      { label: "4pt", color: "#FB7185", from: -4, to: 4 },
      { label: "3pt", color: "#FDBA74", from: -12, to: -4 },
      { label: "3pt", color: "#FDBA74", from: 4, to: 12 },
      { label: "2pt", color: "#FDE68A", from: -20, to: -12 },
      { label: "2pt", color: "#FDE68A", from: 12, to: 20 },
    ],
    scoreColors: [
      { pts: 4, color: "#FB7185" },
      { pts: 3, color: "#FDBA74" },
      { pts: 2, color: "#FDE68A" },
    ],
  },
  {
    name: "D: Earth & Gold",
    description: "Rich gold → Warm brown → Light tan — grounded, organic feel with high contrast center",
    arcGradient: ["#F4A261", "#E8553A", "#2A9D8F"],
    zones: [
      { label: "4pt", color: "#F59E0B", from: -4, to: 4 },
      { label: "3pt", color: "#D97706", from: -12, to: -4 },
      { label: "3pt", color: "#D97706", from: 4, to: 12 },
      { label: "2pt", color: "#E5D5B0", from: -20, to: -12 },
      { label: "2pt", color: "#E5D5B0", from: 12, to: 20 },
    ],
    scoreColors: [
      { pts: 4, color: "#F59E0B" },
      { pts: 3, color: "#D97706" },
      { pts: 2, color: "#E5D5B0" },
    ],
  },
  {
    name: "E: Warm-Cool Bridge",
    description: "Gold center → Primary red → Accent teal — uses the app's own design tokens as scoring colors",
    arcGradient: ["#F4A261", "#E8553A", "#2A9D8F"],
    zones: [
      { label: "4pt", color: "#FBBF24", from: -4, to: 4 },
      { label: "3pt", color: "#E8553A", from: -12, to: -4 },
      { label: "3pt", color: "#E8553A", from: 4, to: 12 },
      { label: "2pt", color: "#5EEAD4", from: -20, to: -12 },
      { label: "2pt", color: "#5EEAD4", from: 12, to: 20 },
    ],
    scoreColors: [
      { pts: 4, color: "#FBBF24" },
      { pts: 3, color: "#E8553A" },
      { pts: 2, color: "#5EEAD4" },
    ],
  },
  {
    name: "F: Jewel Tones",
    description: "Emerald → Sapphire → Amethyst — rich, bold scoring zones that contrast clearly",
    arcGradient: ["#F4A261", "#E8553A", "#2A9D8F"],
    zones: [
      { label: "4pt", color: "#34D399", from: -4, to: 4 },
      { label: "3pt", color: "#60A5FA", from: -12, to: -4 },
      { label: "3pt", color: "#60A5FA", from: 4, to: 12 },
      { label: "2pt", color: "#C084FC", from: -20, to: -12 },
      { label: "2pt", color: "#C084FC", from: 12, to: 20 },
    ],
    scoreColors: [
      { pts: 4, color: "#34D399" },
      { pts: 3, color: "#60A5FA" },
      { pts: 2, color: "#C084FC" },
    ],
  },
];

function DialPreview({ palette, targetDeg }: { palette: PaletteOption; targetDeg: number }) {
  const R_OUTER = RADIUS + 5;
  const R_INNER = RADIUS - 5;

  const arcStart = posOnArc(0, RADIUS);
  const arcEnd = posOnArc(180, RADIUS);
  const arcPath = `M ${arcStart.x} ${arcStart.y} A ${RADIUS} ${RADIUS} 0 0 1 ${arcEnd.x} ${arcEnd.y}`;
  const bgArcPath = `${arcPath} L ${CENTER_X} ${CENTER_Y} Z`;

  function bandPath(fromDeg: number, toDeg: number) {
    const s = Math.max(0, targetDeg + fromDeg);
    const e = Math.min(180, targetDeg + toDeg);
    if (s >= e) return null;
    const oS = posOnArc(s, R_OUTER);
    const oE = posOnArc(e, R_OUTER);
    const iS = posOnArc(s, R_INNER);
    const iE = posOnArc(e, R_INNER);
    const la = e - s > 180 ? 1 : 0;
    return `M ${oS.x} ${oS.y} A ${R_OUTER} ${R_OUTER} 0 ${la} 1 ${oE.x} ${oE.y} L ${iE.x} ${iE.y} A ${R_INNER} ${R_INNER} 0 ${la} 0 ${iS.x} ${iS.y} Z`;
  }

  // Simulated player arrows
  const arrows = [
    { pos: targetDeg - 2, color: "#E8553A", initial: "A" },
    { pos: targetDeg + 8, color: "#2A9D8F", initial: "B" },
    { pos: targetDeg - 15, color: "#7C3AED", initial: "C" },
    { pos: targetDeg + 30, color: "#F97316", initial: "D" },
  ];

  function getScore(guessDeg: number) {
    const diff = Math.abs(guessDeg - targetDeg);
    if (diff <= 4) return 4;
    if (diff <= 12) return 3;
    if (diff <= 20) return 2;
    return 0;
  }

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE - 10}`} className="w-full" style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={`ag-${palette.name}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={palette.arcGradient[0]} />
          <stop offset="50%" stopColor={palette.arcGradient[1]} />
          <stop offset="100%" stopColor={palette.arcGradient[2]} />
        </linearGradient>
      </defs>

      <path d={bgArcPath} fill="#FFF8F0" opacity={0.5} />

      {/* Tick marks */}
      {Array.from({ length: 37 }).map((_, i) => {
        const deg = i * 5;
        const isMajor = deg % 30 === 0;
        const outer = posOnArc(deg, RADIUS + 4);
        const inner = posOnArc(deg, RADIUS - (isMajor ? 10 : 5));
        return (
          <line
            key={i}
            x1={outer.x}
            y1={outer.y}
            x2={inner.x}
            y2={inner.y}
            stroke={isMajor ? "#BBB" : "#DDD"}
            strokeWidth={isMajor ? 1.5 : 0.75}
          />
        );
      })}

      {/* Arc */}
      <path d={arcPath} fill="none" stroke={`url(#ag-${palette.name})`} strokeWidth={8} strokeLinecap="round" />

      {/* Scoring zones */}
      {palette.zones.map((z, i) => {
        const d = bandPath(z.from, z.to);
        if (!d) return null;
        return <path key={i} d={d} fill={z.color} />;
      })}

      {/* Target line */}
      <line
        x1={CENTER_X}
        y1={CENTER_Y}
        x2={posOnArc(targetDeg, RADIUS + 8).x}
        y2={posOnArc(targetDeg, RADIUS + 8).y}
        stroke="#E8553A"
        strokeWidth={2.5}
        strokeDasharray="5 3"
        strokeLinecap="round"
      />
      <circle
        cx={posOnArc(targetDeg, RADIUS + 12).x}
        cy={posOnArc(targetDeg, RADIUS + 12).y}
        r={5}
        fill="#E8553A"
        stroke="white"
        strokeWidth={2}
      />

      {/* Player arrows */}
      {arrows.map((a, i) => {
        const clampedPos = Math.max(5, Math.min(175, a.pos));
        const tipPos = posOnArc(clampedPos, RADIUS - 8);
        const dotPos = posOnArc(clampedPos, RADIUS + 16);
        const score = getScore(clampedPos);
        const scoreColor = score > 0
          ? palette.scoreColors.find((sc) => sc.pts === score)?.color || "#999"
          : "#999";
        return (
          <g key={i}>
            <line x1={CENTER_X} y1={CENTER_Y} x2={tipPos.x} y2={tipPos.y} stroke={a.color} strokeWidth={2} strokeLinecap="round" opacity={0.4} />
            <circle cx={dotPos.x} cy={dotPos.y} r={9} fill={a.color} stroke="white" strokeWidth={1.5} />
            <text x={dotPos.x} y={dotPos.y + 3.5} textAnchor="middle" fill="white" fontSize={9} fontWeight="bold">
              {a.initial}
            </text>
            <text x={dotPos.x} y={dotPos.y - 14} textAnchor="middle" fill={scoreColor} fontSize={10} fontWeight="bold">
              {score > 0 ? `+${score}` : "Miss"}
            </text>
          </g>
        );
      })}

      <circle cx={CENTER_X} cy={CENTER_Y} r={4} fill="#DDD" />
      <circle cx={CENTER_X} cy={CENTER_Y} r={1.5} fill="#BBB" />
    </svg>
  );
}

export default function PaletteTest() {
  const targetDeg = 90;

  return (
    <div className="min-h-screen bg-[#FFF8F0] p-6">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-2 text-2xl font-bold text-[#2D2D2D]">Spectrum Dial — Scoring Zone Palette Explorer</h1>
        <p className="mb-8 text-sm text-[#666]">
          Comparing scoring zone color palettes. Target at 90° with 4 simulated player guesses.
        </p>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {palettes.map((palette) => (
            <div
              key={palette.name}
              className="rounded-2xl border border-[#E8E0D8] bg-white/70 p-4 shadow-sm backdrop-blur-sm"
            >
              <h2 className="mb-1 text-base font-bold text-[#2D2D2D]">{palette.name}</h2>
              <p className="mb-3 text-xs text-[#888] leading-tight">{palette.description}</p>
              <DialPreview palette={palette} targetDeg={targetDeg} />

              {/* Color swatches */}
              <div className="mt-3 flex items-center gap-2">
                {palette.zones
                  .filter((z, i, arr) => arr.findIndex((a) => a.color === z.color) === i)
                  .map((z, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <div
                        className="h-4 w-4 rounded-sm border border-black/10"
                        style={{ backgroundColor: z.color }}
                      />
                      <span className="text-[10px] text-[#888]">{z.label}</span>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>

        {/* Second row with target at edge to test clipping */}
        <h2 className="mb-4 mt-12 text-lg font-bold text-[#2D2D2D]">Edge Case — Target at 40°</h2>
        <p className="mb-6 text-sm text-[#666]">
          Same palettes with target near the left edge to see how zones look when partially clipped.
        </p>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {palettes.map((palette) => (
            <div
              key={palette.name}
              className="rounded-2xl border border-[#E8E0D8] bg-white/70 p-4 shadow-sm backdrop-blur-sm"
            >
              <h3 className="mb-2 text-sm font-semibold text-[#2D2D2D]">{palette.name}</h3>
              <DialPreview palette={palette} targetDeg={40} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
