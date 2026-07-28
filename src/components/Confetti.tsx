"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

// Caustic (cool) and sun (warm) tints, plus a couple of muted foam/success
// motes for variety — the two lights refracting through the water.
const COLORS = [
  "rgba(111, 224, 210, 0.9)",
  "rgba(111, 224, 210, 0.55)",
  "rgba(255, 223, 163, 0.85)",
  "rgba(255, 223, 163, 0.5)",
  "rgba(88, 217, 166, 0.7)",
  "rgba(232, 245, 243, 0.45)",
];

interface Particle {
  id: number;
  x: number;
  xDrift: number;
  color: string;
  size: number;
  delay: number;
  duration: number;
  maxOpacity: number;
  ring: boolean;
}

// Scale the celebration to how well the team actually did.
function particleCountForScore(percentage: number) {
  if (percentage >= 80) return 60;
  if (percentage >= 60) return 40;
  if (percentage >= 40) return 22;
  if (percentage >= 20) return 10;
  return 4;
}

export default function Confetti({ percentage = 100 }: { percentage?: number }) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handleChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handleChange);
    return () => mq.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      setParticles([]);
      return;
    }
    const count = particleCountForScore(percentage);
    const ps: Particle[] = Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      xDrift: (Math.random() - 0.5) * 20,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: 5 + Math.random() * 15,
      delay: Math.random() * 1.2,
      duration: 3.2 + Math.random() * 3,
      maxOpacity: 0.5 + Math.random() * 0.5,
      ring: Math.random() < 0.35,
    }));
    setParticles(ps);
  }, [percentage, reducedMotion]);

  if (reducedMotion) {
    // Minimal, static celebration — no rising/drifting particles.
    return (
      <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="absolute inset-x-0 bottom-8 flex justify-center gap-3"
        >
          {COLORS.slice(0, 5).map((color, i) => (
            <div
              key={i}
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: color }}
            />
          ))}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          initial={{
            x: `${p.x}vw`,
            y: "108vh",
            opacity: 0,
            scale: 0.6,
          }}
          animate={{
            x: [
              `${p.x}vw`,
              `${p.x + p.xDrift * 0.5}vw`,
              `${p.x - p.xDrift * 0.35}vw`,
              `${p.x + p.xDrift}vw`,
            ],
            y: "-14vh",
            opacity: [0, p.maxOpacity, p.maxOpacity, 0],
            scale: [0.6, 1, 1, 0.85],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            ease: "easeOut",
            opacity: { duration: p.duration, delay: p.delay, times: [0, 0.18, 0.82, 1] },
            scale: { duration: p.duration, delay: p.delay, times: [0, 0.18, 0.82, 1] },
            x: { duration: p.duration, delay: p.delay, ease: "easeInOut" },
          }}
          style={{
            position: "absolute",
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            background: p.ring ? "transparent" : p.color,
            border: p.ring ? `1.5px solid ${p.color}` : undefined,
            boxShadow: p.ring ? undefined : `0 0 ${Math.round(p.size * 1.4)}px ${p.color}`,
          }}
        />
      ))}
    </div>
  );
}
