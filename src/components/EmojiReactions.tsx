"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import {
  playReactionPoop,
  playReactionSkull,
  playReactionRainbow,
} from "@/lib/sounds";

const EMOJIS = ["💩", "💀", "🌈"] as const;

const EMOJI_SOUNDS: Record<string, () => void> = {
  "💩": playReactionPoop,
  "💀": playReactionSkull,
  "🌈": playReactionRainbow,
};

// ── Reaction data ────────────────────────────────────────────

interface Reaction {
  id: string;
  emoji: string;
  x: number; // % from left (spawn point)
  y: number; // % from bottom (spawn point)
  seed: number; // deterministic randomness
  createdAt: number;
}

interface Combo {
  id: string;
  emoji: string;
  count: number;
  seed: number;
  createdAt: number;
}

const MAX_LIFETIME_MS = 12000;
const COMBO_LIFETIME_MS = 4000;
const COMBO_WINDOW_MS = 2500;
const COMBO_COOLDOWN_MS = 5000;
const COMBO_MIN_PLAYERS = 3;

function makeReaction(emoji: string, id: string): Reaction {
  return {
    id,
    emoji,
    x: 10 + Math.random() * 70,
    y: 5 + Math.random() * 15,
    seed: Math.random(),
    createdAt: Date.now(),
  };
}

// ── Per-emoji renderers ──────────────────────────────────────

/** 💩 Poop Burst: appears, then splits into smaller poops 3 times */
function PoopBurst({ x, y, seed }: { x: number; y: number; seed: number }) {
  // Generation 0: 1 big poop
  // Generation 1: 3 medium poops burst outward
  // Generation 2: 9 small poops burst further
  const gen1Angles = [
    -40 + seed * 20,
    80 + seed * 30,
    200 + seed * 25,
  ];
  const gen2Offsets = [
    { dx: -20, dy: -15 },
    { dx: 15, dy: -25 },
    { dx: 25, dy: 5 },
    { dx: -30, dy: 10 },
    { dx: 5, dy: -35 },
    { dx: -10, dy: 20 },
    { dx: 35, dy: -10 },
    { dx: -25, dy: -30 },
    { dx: 20, dy: 15 },
  ];

  return (
    <div
      className="absolute"
      style={{ left: `${x}%`, bottom: `${y}%` }}
    >
      {/* Gen 0: big poop, appears then fades */}
      <div className="poop-gen0">
        <span className="text-4xl sm:text-5xl drop-shadow-md">💩</span>
      </div>

      {/* Gen 1: 3 medium poops burst outward */}
      {gen1Angles.map((angle, i) => {
        const rad = (angle * Math.PI) / 180;
        const dist = 60 + seed * 40;
        const tx = Math.cos(rad) * dist;
        const ty = -Math.abs(Math.sin(rad) * dist); // always go upward-ish
        return (
          <div
            key={`g1-${i}`}
            className="poop-gen1"
            style={{
              "--tx": `${tx}px`,
              "--ty": `${ty}px`,
              animationDelay: `0.4s`,
            } as React.CSSProperties}
          >
            <span className="text-2xl sm:text-3xl drop-shadow-sm">💩</span>
          </div>
        );
      })}

      {/* Gen 2: 9 tiny poops scatter everywhere */}
      {gen2Offsets.map((off, i) => {
        const baseAngle = gen1Angles[i % 3];
        const rad = (baseAngle * Math.PI) / 180;
        const baseDist = 60 + seed * 40;
        const bx = Math.cos(rad) * baseDist + off.dx * 2;
        const by = -Math.abs(Math.sin(rad) * baseDist) + off.dy * 2;
        return (
          <div
            key={`g2-${i}`}
            className="poop-gen2"
            style={{
              "--tx": `${bx}px`,
              "--ty": `${by}px`,
              animationDelay: `${0.9 + i * 0.05}s`,
            } as React.CSSProperties}
          >
            <span className="text-sm sm:text-base">💩</span>
          </div>
        );
      })}
    </div>
  );
}

/** 💀 Skull: floats up with a ghostly wobble, spawns bone particles */
function SkullHaunt({ x, y, seed }: { x: number; y: number; seed: number }) {
  const boneEmojis = ["🦴", "👻", "🦴", "👻", "🦴", "💀"];
  return (
    <div
      className="absolute"
      style={{ left: `${x}%`, bottom: `${y}%` }}
    >
      {/* Main skull — spooky float */}
      <div className="skull-main">
        <span className="text-5xl sm:text-6xl drop-shadow-lg">💀</span>
      </div>

      {/* Bone/ghost particles scatter outward */}
      {boneEmojis.map((bone, i) => {
        const angle = (i / boneEmojis.length) * 360 + seed * 60;
        const rad = (angle * Math.PI) / 180;
        const dist = 40 + seed * 50;
        return (
          <div
            key={`bone-${i}`}
            className="skull-particle"
            style={{
              "--tx": `${Math.cos(rad) * dist}px`,
              "--ty": `${-Math.abs(Math.sin(rad)) * dist - 30}px`,
              "--rot": `${(seed - 0.5) * 720}deg`,
              animationDelay: `${0.3 + i * 0.15}s`,
            } as React.CSSProperties}
          >
            <span className="text-lg sm:text-xl">{bone}</span>
          </div>
        );
      })}
    </div>
  );
}

/** 🌈 Rainbow: a short rainbow shooting star that arcs across the screen */
function RainbowFly({ y, seed }: { y: number; seed: number }) {
  const bottomPct = 15 + y + seed * 35;
  const fromLeft = seed > 0.5;
  const arcCurve = 70 + seed * 80; // how much it curves upward
  const gradId = `rg-${seed.toString(36).slice(2, 8)}`;

  return (
    <div
      className="absolute"
      style={{
        bottom: `${bottomPct}%`,
        left: 0,
        width: "100%",
        height: "200px",
        pointerEvents: "none",
      }}
    >
      <svg
        viewBox="0 0 800 200"
        className="w-full h-full"
        preserveAspectRatio="none"
        fill="none"
        style={{ overflow: "visible" }}
      >
        <defs>
          {/* Rainbow gradient perpendicular to stroke */}
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FF0000" stopOpacity="0.35" />
            <stop offset="16%" stopColor="#FF8C00" stopOpacity="0.32" />
            <stop offset="32%" stopColor="#FFE600" stopOpacity="0.28" />
            <stop offset="48%" stopColor="#00D232" stopOpacity="0.28" />
            <stop offset="64%" stopColor="#0082FF" stopOpacity="0.28" />
            <stop offset="80%" stopColor="#5A00A0" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#A000DC" stopOpacity="0.18" />
          </linearGradient>
        </defs>
        {/* Full-width curved path — the "shooting star" trail */}
        <path
          d={fromLeft
            ? `M -50 ${180 - arcCurve * 0.2} Q 400 ${180 - arcCurve}, 850 ${180 - arcCurve * 0.2}`
            : `M 850 ${180 - arcCurve * 0.2} Q 400 ${180 - arcCurve}, -50 ${180 - arcCurve * 0.2}`
          }
          stroke={`url(#${gradId})`}
          strokeWidth={12}
          strokeLinecap="round"
          fill="none"
          className={fromLeft ? "rainbow-shoot-right" : "rainbow-shoot-left"}
        />
      </svg>
    </div>
  );
}

/** ✨ Combo Burst: a giant emoji explosion in center-screen with shockwave rings */
function ComboBurst({
  emoji,
  count,
  seed,
}: {
  emoji: string;
  count: number;
  seed: number;
}) {
  const particleCount = 14;
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {/* Shockwave rings */}
      <div className="combo-ring combo-ring-1" />
      <div className="combo-ring combo-ring-2" />
      <div className="combo-ring combo-ring-3" />

      {/* Burst particles flying outward */}
      {Array.from({ length: particleCount }).map((_, i) => {
        const angle = (i / particleCount) * 360 + seed * 30;
        const rad = (angle * Math.PI) / 180;
        const dist = 220 + seed * 120;
        return (
          <div
            key={`cp-${i}`}
            className="combo-particle absolute"
            style={
              {
                "--tx": `${Math.cos(rad) * dist}px`,
                "--ty": `${Math.sin(rad) * dist}px`,
                animationDelay: `${i * 0.025}s`,
              } as React.CSSProperties
            }
          >
            <span className="text-3xl sm:text-4xl">{emoji}</span>
          </div>
        );
      })}

      {/* The MEGA emoji + label */}
      <div className="combo-mega flex flex-col items-center">
        <span className="combo-mega-emoji text-[110px] sm:text-[170px] leading-none drop-shadow-2xl">
          {emoji}
        </span>
        <span className="combo-label mt-2 text-3xl font-black tracking-widest sm:text-5xl">
          ×{count} SYNC!
        </span>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────

export default function EmojiReactions({
  gameId,
  sessionId,
}: {
  gameId: Id<"games">;
  sessionId: string;
}) {
  const sendReaction = useMutation(api.games.sendReaction);
  const reactions = useQuery(api.games.getReactions, { gameId, sessionId });
  const myPlayer = useQuery(api.games.getMyPlayer, { gameId, sessionId });
  const [floating, setFloating] = useState<Reaction[]>([]);
  const [combos, setCombos] = useState<Combo[]>([]);
  const seenIds = useRef(new Set<string>());
  const initialLoadRef = useRef(true);
  const localIdCounter = useRef(0);

  // Combo detection state
  const trackedRef = useRef<{ playerId: string; emoji: string; ts: number }[]>([]);
  const lastComboAtRef = useRef<Record<string, number>>({});
  const myPlayerIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (myPlayer?._id) myPlayerIdRef.current = myPlayer._id;
  }, [myPlayer]);

  const checkCombo = useCallback(() => {
    const now = Date.now();
    trackedRef.current = trackedRef.current.filter(
      (t) => now - t.ts < COMBO_WINDOW_MS
    );
    const byEmoji = new Map<string, { players: Set<string>; total: number }>();
    for (const t of trackedRef.current) {
      let entry = byEmoji.get(t.emoji);
      if (!entry) {
        entry = { players: new Set(), total: 0 };
        byEmoji.set(t.emoji, entry);
      }
      entry.players.add(t.playerId);
      entry.total++;
    }
    for (const [emoji, entry] of byEmoji) {
      if (entry.players.size < COMBO_MIN_PLAYERS) continue;
      const last = lastComboAtRef.current[emoji] ?? 0;
      if (now - last < COMBO_COOLDOWN_MS) continue;
      lastComboAtRef.current[emoji] = now;
      const id = `combo-${now}-${emoji}`;
      setCombos((prev) => [
        ...prev,
        { id, emoji, count: entry.total, seed: Math.random(), createdAt: now },
      ]);
      const sound = EMOJI_SOUNDS[emoji];
      if (sound) {
        sound();
        setTimeout(sound, 130);
        setTimeout(sound, 260);
      }
    }
  }, []);

  useEffect(() => {
    if (!reactions) return;
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      for (const r of reactions) seenIds.current.add(r._id);
      return;
    }
    const newReactions: Reaction[] = [];
    for (const r of reactions) {
      if (seenIds.current.has(r._id)) continue;
      seenIds.current.add(r._id);
      newReactions.push(makeReaction(r.emoji, r._id));
      trackedRef.current.push({
        playerId: r.playerId,
        emoji: r.emoji,
        ts: Date.now(),
      });
    }
    if (newReactions.length > 0) {
      const sound = EMOJI_SOUNDS[newReactions[0].emoji];
      if (sound) sound();
      setFloating((prev) => [...prev, ...newReactions]);
      checkCombo();
    }
  }, [reactions, checkCombo]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setFloating((prev) => prev.filter((r) => now - r.createdAt < MAX_LIFETIME_MS));
      setCombos((prev) => prev.filter((c) => now - c.createdAt < COMBO_LIFETIME_MS));
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  const handleSend = useCallback(
    (emoji: string) => {
      const localId = `local-${Date.now()}-${++localIdCounter.current}`;
      const sound = EMOJI_SOUNDS[emoji];
      if (sound) sound();
      setFloating((prev) => [...prev, makeReaction(emoji, localId)]);
      const myId = myPlayerIdRef.current ?? `me-${sessionId}`;
      trackedRef.current.push({ playerId: myId, emoji, ts: Date.now() });
      checkCombo();
      sendReaction({ gameId, sessionId, emoji });
    },
    [gameId, sessionId, sendReaction, checkCombo]
  );

  return (
    <>
      <style jsx global>{`
        /* ── 💩 Poop Burst ── */
        .poop-gen0 {
          animation: poop-appear 2s ease-out forwards;
        }
        @keyframes poop-appear {
          0% { transform: scale(0) rotate(-20deg); opacity: 0; }
          8% { transform: scale(1.4) rotate(10deg); opacity: 0.85; }
          15% { transform: scale(1) rotate(0deg); opacity: 0.8; }
          50% { transform: scale(0.9) rotate(-5deg); opacity: 0.5; }
          100% { transform: scale(0.2) rotate(15deg); opacity: 0; }
        }

        .poop-gen1 {
          position: absolute;
          top: 0; left: 0;
          animation: poop-burst1 2.5s ease-out forwards;
          opacity: 0;
        }
        @keyframes poop-burst1 {
          0% { transform: translate(0, 0) scale(0); opacity: 0; }
          5% { transform: translate(0, 0) scale(0.5); opacity: 0.8; }
          40% { transform: translate(var(--tx), var(--ty)) scale(1); opacity: 0.7; }
          70% { transform: translate(var(--tx), calc(var(--ty) - 20px)) scale(0.7); opacity: 0.4; }
          100% { transform: translate(var(--tx), calc(var(--ty) - 40px)) scale(0.2); opacity: 0; }
        }

        .poop-gen2 {
          position: absolute;
          top: 0; left: 0;
          animation: poop-burst2 3s ease-out forwards;
          opacity: 0;
        }
        @keyframes poop-burst2 {
          0% { transform: translate(0, 0) scale(0); opacity: 0; }
          10% { transform: translate(calc(var(--tx) * 0.5), calc(var(--ty) * 0.5)) scale(1); opacity: 0.6; }
          50% { transform: translate(var(--tx), var(--ty)) scale(0.8); opacity: 0.4; }
          100% { transform: translate(calc(var(--tx) * 1.3), calc(var(--ty) * 1.3 - 30px)) scale(0); opacity: 0; }
        }

        /* ── 💀 Skull Haunt ── */
        .skull-main {
          animation: skull-rise 4s ease-out forwards;
        }
        @keyframes skull-rise {
          0% { transform: translateY(0) scale(0) rotate(0deg); opacity: 0; }
          5% { transform: translateY(0) scale(1.3) rotate(-10deg); opacity: 0.85; }
          15% { transform: translateY(-20px) scale(1.1) rotate(5deg); opacity: 0.8; }
          30% { transform: translateY(-60px) scale(1) rotate(-8deg); opacity: 0.7; }
          50% { transform: translateY(-120px) scale(0.9) rotate(6deg); opacity: 0.55; }
          70% { transform: translateY(-180px) scale(0.8) rotate(-4deg); opacity: 0.35; }
          100% { transform: translateY(-280px) scale(0.4) rotate(15deg); opacity: 0; }
        }

        .skull-particle {
          position: absolute;
          top: 0; left: 0;
          animation: skull-scatter 3s ease-out forwards;
          opacity: 0;
        }
        @keyframes skull-scatter {
          0% { transform: translate(0, 0) scale(0) rotate(0deg); opacity: 0; }
          10% { transform: translate(0, 0) scale(1.2) rotate(0deg); opacity: 0.7; }
          50% { transform: translate(var(--tx), var(--ty)) scale(0.8) rotate(var(--rot)); opacity: 0.5; }
          100% { transform: translate(calc(var(--tx) * 1.5), calc(var(--ty) * 1.8)) scale(0) rotate(var(--rot)); opacity: 0; }
        }

        /* ── 🌈 Rainbow Shooting Star ── */
        /* The dash trick: dasharray = [visible length, gap].
           Animate dashoffset from full-length to negative to make it
           appear to shoot across then vanish like a comet tail. */
        .rainbow-shoot-right, .rainbow-shoot-left {
          stroke-dasharray: 200 1200;
          stroke-dashoffset: 1200;
          animation: rainbow-shoot 2.5s cubic-bezier(0.2, 0.6, 0.3, 1) forwards;
          filter: blur(0.4px);
        }
        @keyframes rainbow-shoot {
          0% { stroke-dashoffset: 1200; opacity: 0; }
          5% { opacity: 0.9; }
          60% { opacity: 0.8; }
          85% { opacity: 0.4; }
          100% { stroke-dashoffset: -400; opacity: 0; }
        }

        /* ── ✨ Combo Burst ── */
        .combo-mega {
          animation: combo-mega-pop 3.8s cubic-bezier(0.2, 1.4, 0.4, 1) forwards;
        }
        @keyframes combo-mega-pop {
          0% { transform: scale(0) rotate(-30deg); opacity: 0; }
          8% { transform: scale(1.5) rotate(8deg); opacity: 1; }
          16% { transform: scale(1.05) rotate(-4deg); opacity: 1; }
          24% { transform: scale(1.2) rotate(2deg); opacity: 1; }
          32% { transform: scale(1.1) rotate(0deg); opacity: 1; }
          82% { transform: scale(1.1) rotate(0deg); opacity: 1; }
          100% { transform: scale(1.8) rotate(0deg); opacity: 0; }
        }

        .combo-mega-emoji {
          animation: combo-mega-wobble 0.6s ease-in-out infinite;
          display: inline-block;
        }
        @keyframes combo-mega-wobble {
          0%, 100% { transform: rotate(-3deg); }
          50% { transform: rotate(3deg); }
        }

        .combo-label {
          color: #E8553A;
          animation: combo-label-shake 0.3s ease-in-out infinite;
          text-shadow:
            2px 2px 0 #fff,
            -2px 2px 0 #fff,
            2px -2px 0 #fff,
            -2px -2px 0 #fff,
            0 0 24px rgba(232, 85, 58, 0.6);
        }
        @keyframes combo-label-shake {
          0%, 100% { transform: translateX(-1px) rotate(-2deg) scale(1); }
          50% { transform: translateX(1px) rotate(2deg) scale(1.05); }
        }

        .combo-ring {
          position: absolute;
          border-radius: 50%;
          border: 5px solid currentColor;
          width: 120px;
          height: 120px;
          opacity: 0;
        }
        .combo-ring-1 { color: #E8553A; animation: combo-ring-expand 1.6s ease-out forwards; }
        .combo-ring-2 { color: #2A9D8F; animation: combo-ring-expand 1.8s ease-out 0.18s forwards; }
        .combo-ring-3 { color: #FFD23F; animation: combo-ring-expand 2.0s ease-out 0.36s forwards; }
        @keyframes combo-ring-expand {
          0% { transform: scale(0); opacity: 0.85; border-width: 6px; }
          100% { transform: scale(9); opacity: 0; border-width: 1px; }
        }

        .combo-particle {
          animation: combo-particle-burst 2.5s ease-out forwards;
          opacity: 0;
        }
        @keyframes combo-particle-burst {
          0% { transform: translate(0, 0) scale(0) rotate(0deg); opacity: 0; }
          15% { transform: translate(calc(var(--tx) * 0.3), calc(var(--ty) * 0.3)) scale(1.2) rotate(120deg); opacity: 1; }
          70% { transform: translate(calc(var(--tx) * 0.9), calc(var(--ty) * 0.9)) scale(0.7) rotate(540deg); opacity: 0.6; }
          100% { transform: translate(var(--tx), var(--ty)) scale(0) rotate(720deg); opacity: 0; }
        }
      `}</style>

      {/* Full-screen overlay */}
      <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
        {floating.map((r) => {
          if (r.emoji === "💩") {
            return <PoopBurst key={r.id} x={r.x} y={r.y} seed={r.seed} />;
          }
          if (r.emoji === "💀") {
            return <SkullHaunt key={r.id} x={r.x} y={r.y} seed={r.seed} />;
          }
          if (r.emoji === "🌈") {
            return <RainbowFly key={r.id} y={r.y} seed={r.seed} />;
          }
          return null;
        })}

        {/* Combo bursts — center-screen mega celebrations */}
        {combos.map((c) => (
          <ComboBurst key={c.id} emoji={c.emoji} count={c.count} seed={c.seed} />
        ))}
      </div>

      {/* Reaction buttons */}
      <div className="fixed right-3 bottom-24 z-50 flex flex-col gap-1.5 sm:gap-2">
        {EMOJIS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => handleSend(emoji)}
            className="rounded-full bg-white/80 p-1.5 sm:p-2 text-lg sm:text-xl shadow-md backdrop-blur-sm transition-transform hover:scale-110 active:scale-90"
          >
            {emoji}
          </button>
        ))}
      </div>
    </>
  );
}
