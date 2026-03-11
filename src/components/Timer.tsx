"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

interface TimerProps {
  endsAt: number | undefined;
  totalSeconds: number;
}

export default function Timer({ endsAt, totalSeconds }: TimerProps) {
  const [secondsLeft, setSecondsLeft] = useState(totalSeconds);

  useEffect(() => {
    if (!endsAt) return;

    function tick() {
      const remaining = Math.max(0, Math.ceil((endsAt! - Date.now()) / 1000));
      setSecondsLeft(remaining);
    }

    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [endsAt]);

  const progress = totalSeconds > 0 ? secondsLeft / totalSeconds : 0;
  const isUrgent = secondsLeft <= 10;
  const isWarning = secondsLeft <= 30 && !isUrgent;
  const minutes = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;

  // Circular progress ring
  const ringSize = 80;
  const strokeWidth = 4;
  const radius = (ringSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  const ringColor = isUrgent
    ? "#E8553A"
    : isWarning
      ? "#F4A261"
      : "#2A9D8F";

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: ringSize, height: ringSize }}>
        {/* Background ring */}
        <svg
          width={ringSize}
          height={ringSize}
          className="absolute inset-0 -rotate-90"
        >
          <circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={radius}
            fill="none"
            stroke="#E5E5E5"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={radius}
            fill="none"
            stroke={ringColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{ transition: "stroke-dashoffset 0.25s linear, stroke 0.5s" }}
          />
        </svg>

        {/* Time text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.span
            className="text-lg font-bold tabular-nums"
            style={{ color: ringColor }}
            animate={
              isUrgent ? { scale: [1, 1.08, 1] } : {}
            }
            transition={
              isUrgent ? { repeat: Infinity, duration: 1 } : {}
            }
          >
            {minutes}:{secs.toString().padStart(2, "0")}
          </motion.span>
        </div>
      </div>
    </div>
  );
}
