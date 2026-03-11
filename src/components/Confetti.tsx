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
  color: string;
  size: number;
  delay: number;
  rotation: number;
  shape: "circle" | "square" | "triangle";
}

export default function Confetti({ count = 40 }: { count?: number }) {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    const ps: Particle[] = Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: 6 + Math.random() * 8,
      delay: Math.random() * 0.8,
      rotation: Math.random() * 360,
      shape: (["circle", "square", "triangle"] as const)[
        Math.floor(Math.random() * 3)
      ],
    }));
    setParticles(ps);
  }, [count]);

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
            y: "110vh",
            rotate: p.rotation + 720,
            opacity: [1, 1, 0.8, 0],
          }}
          transition={{
            duration: 2.5 + Math.random() * 2,
            delay: p.delay,
            ease: "easeIn",
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
