"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

const COLORS = [
  "#E8553A",
  "#2A9D8F",
  "#F4A261",
  "#7C3AED",
  "#FFD700",
  "#EC4899",
  "#06B6D4",
  "#84CC16",
];

interface Particle {
  id: number;
  x: number;
  xDrift: number;
  color: string;
  size: number;
  delay: number;
  duration: number;
  rotation: number;
  shape: "circle" | "square" | "triangle";
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
      xDrift: (Math.random() - 0.5) * 30,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: 6 + Math.random() * 8,
      delay: Math.random() * 0.8,
      duration: 2.5 + Math.random() * 2,
      rotation: Math.random() * 360,
      shape: (["circle", "square", "triangle"] as const)[
        Math.floor(Math.random() * 3)
      ],
    }));
    setParticles(ps);
  }, [percentage, reducedMotion]);

  if (reducedMotion) {
    // Minimal, static celebration — no falling/rotating particles.
    return (
      <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="absolute inset-x-0 top-8 flex justify-center gap-3"
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
            y: -20,
            rotate: 0,
            opacity: 1,
          }}
          animate={{
            x: [`${p.x}vw`, `${p.x + p.xDrift * 0.3}vw`, `${p.x + p.xDrift}vw`, `${p.x + p.xDrift * 0.7}vw`],
            y: "110vh",
            rotate: p.rotation + 720,
            opacity: [1, 1, 0.8, 0],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            ease: "easeIn",
            x: { duration: p.duration, ease: "easeInOut" },
          }}
          style={{
            position: "absolute",
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            borderRadius: p.shape === "circle" ? "50%" : p.shape === "square" ? "2px" : "0",
            clipPath:
              p.shape === "triangle"
                ? "polygon(50% 0%, 0% 100%, 100% 100%)"
                : undefined,
          }}
        />
      ))}
    </div>
  );
}
