"use client";

import { useCallback, useRef, useState } from "react";
import { motion } from "framer-motion";

interface PlayerArrow {
  id: string;
  color: string;
  initial: string;
  position: number;
  lockedIn: boolean;
}

interface SpectrumDialProps {
  leftLabel: string;
  rightLabel: string;
  targetPosition?: number;
  showScoringWedge?: boolean;
  myPosition?: number;
  onPositionChange?: (position: number) => void;
  interactive?: boolean;
  playerArrows?: PlayerArrow[];
  lockedIn?: boolean;
}

const SIZE = 340;
const CENTER_X = SIZE / 2;
const CENTER_Y = SIZE - 30;
const RADIUS = SIZE / 2 - 40;
const INNER_RADIUS = RADIUS - 15;

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

function wedgePath(
  startDeg: number,
  endDeg: number,
  outerR: number,
  innerR: number
): string {
  const s1 = posOnArc(startDeg, outerR);
  const e1 = posOnArc(endDeg, outerR);
  const s2 = posOnArc(endDeg, innerR);
  const e2 = posOnArc(startDeg, innerR);
  const largeArc = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  return `M ${s1.x} ${s1.y} A ${outerR} ${outerR} 0 ${largeArc} 1 ${e1.x} ${e1.y} L ${s2.x} ${s2.y} A ${innerR} ${innerR} 0 ${largeArc} 0 ${e2.x} ${e2.y} Z`;
}

function getScore(guessDeg: number, targetDeg: number): number {
  const diff = Math.abs(guessDeg - targetDeg);
  if (diff <= 2) return 4;
  if (diff <= 6) return 3;
  if (diff <= 12) return 2;
  return 0;
}

function AnimatedArrow({
  arrow,
  showScore,
  targetPosition,
}: {
  arrow: PlayerArrow;
  showScore: boolean;
  targetPosition?: number;
}) {
  const tipPos = posOnArc(arrow.position, RADIUS - 18);
  const circlePos = posOnArc(arrow.position, RADIUS - 10);
  const validTarget =
    targetPosition !== undefined && targetPosition >= 0;
  const score =
    showScore && validTarget
      ? getScore(arrow.position, targetPosition)
      : 0;
  const scored = score > 0;

  return (
    <g>
      <motion.line
        x1={CENTER_X}
        y1={CENTER_Y}
        animate={{ x2: tipPos.x, y2: tipPos.y }}
        transition={{ type: "spring", stiffness: 120, damping: 20 }}
        stroke={arrow.color}
        strokeWidth={2.5}
        strokeLinecap="round"
        opacity={arrow.lockedIn ? 1 : 0.5}
      />
      <motion.circle
        animate={{
          cx: circlePos.x,
          cy: circlePos.y,
          scale: scored ? [1, 1.3, 1] : 1,
        }}
        transition={
          scored
            ? {
                scale: { delay: 1.2, duration: 0.5, repeat: 2 },
                cx: { type: "spring", stiffness: 120, damping: 20 },
                cy: { type: "spring", stiffness: 120, damping: 20 },
              }
            : {
                cx: { type: "spring", stiffness: 120, damping: 20 },
                cy: { type: "spring", stiffness: 120, damping: 20 },
              }
        }
        r={11}
        fill={arrow.color}
        stroke={scored ? "#FFD700" : "white"}
        strokeWidth={scored ? 3 : 2}
      />
      <motion.text
        animate={{ x: circlePos.x, y: circlePos.y }}
        transition={{ type: "spring", stiffness: 120, damping: 20 }}
        textAnchor="middle"
        dominantBaseline="central"
        fill="white"
        fontSize={9}
        fontWeight="bold"
      >
        {arrow.initial}
      </motion.text>

      {/* Floating score */}
      {showScore && scored && (
        <motion.text
          initial={{ opacity: 0, y: circlePos.y }}
          animate={{ opacity: [0, 1, 1, 0], y: circlePos.y - 30 }}
          transition={{ delay: 1.5, duration: 1.5 }}
          x={circlePos.x}
          textAnchor="middle"
          fill={score === 4 ? "#FFD700" : score === 3 ? "#FF9800" : "#FF7043"}
          fontSize={14}
          fontWeight="bold"
        >
          +{score}
        </motion.text>
      )}
    </g>
  );
}

export default function SpectrumDial({
  leftLabel,
  rightLabel,
  targetPosition,
  showScoringWedge,
  myPosition,
  onPositionChange,
  interactive = false,
  playerArrows = [],
  lockedIn = false,
}: SpectrumDialProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // targetPosition is only valid in the 0-180 range; -1 means hidden
  const hasTarget =
    targetPosition !== undefined && targetPosition >= 0 && targetPosition <= 180;

  const getAngleFromEvent = useCallback(
    (clientX: number, clientY: number) => {
      if (!svgRef.current) return null;
      const rect = svgRef.current.getBoundingClientRect();
      const scaleX = rect.width / SIZE;
      const scaleY = rect.height / (SIZE - 20);
      const x = (clientX - rect.left) / scaleX - CENTER_X;
      const y = CENTER_Y - (clientY - rect.top) / scaleY;
      let angle = Math.atan2(y, x) * (180 / Math.PI);
      angle = Math.max(5, Math.min(175, angle));
      return Math.round(angle);
    },
    []
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!interactive || lockedIn) return;
      e.preventDefault();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      setIsDragging(true);
      const angle = getAngleFromEvent(e.clientX, e.clientY);
      if (angle !== null) onPositionChange?.(angle);
    },
    [interactive, lockedIn, getAngleFromEvent, onPositionChange]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging || !interactive || lockedIn) return;
      const angle = getAngleFromEvent(e.clientX, e.clientY);
      if (angle !== null) onPositionChange?.(angle);
    },
    [isDragging, interactive, lockedIn, getAngleFromEvent, onPositionChange]
  );

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const arcStart = posOnArc(0, RADIUS);
  const arcEnd = posOnArc(180, RADIUS);
  const arcPath = `M ${arcStart.x} ${arcStart.y} A ${RADIUS} ${RADIUS} 0 0 1 ${arcEnd.x} ${arcEnd.y}`;

  // Background fill for the semicircle area
  const bgArcPath = `M ${arcStart.x} ${arcStart.y} A ${RADIUS} ${RADIUS} 0 0 1 ${arcEnd.x} ${arcEnd.y} L ${CENTER_X} ${CENTER_Y} Z`;

  return (
    <div className="flex flex-col items-center">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SIZE} ${SIZE - 20}`}
        className="w-full max-w-[420px] touch-none select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <defs>
          <linearGradient id="arcGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#F4A261" />
            <stop offset="50%" stopColor="#E8553A" />
            <stop offset="100%" stopColor="#2A9D8F" />
          </linearGradient>
          <radialGradient id="bgGlow" cx="50%" cy="100%">
            <stop offset="0%" stopColor="#FFF8F0" />
            <stop offset="100%" stopColor="#FFF0E0" />
          </radialGradient>
        </defs>

        {/* Subtle background fill */}
        <path d={bgArcPath} fill="url(#bgGlow)" opacity={0.5} />

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

        {/* Main arc */}
        <path
          d={arcPath}
          fill="none"
          stroke="url(#arcGradient)"
          strokeWidth={10}
          strokeLinecap="round"
        />

        {/* Scoring wedge (reveal) */}
        {showScoringWedge && hasTarget && (
          <motion.g
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.5 }}
          >
            {/* 2pt zone */}
            <motion.path
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.3 }}
              transition={{ duration: 0.4, delay: 0.5 }}
              d={wedgePath(
                Math.max(0, targetPosition - 12),
                Math.min(180, targetPosition + 12),
                RADIUS - 2,
                INNER_RADIUS - 25
              )}
              fill="#FF7043"
            />
            {/* 3pt zone */}
            <motion.path
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              transition={{ duration: 0.4, delay: 0.7 }}
              d={wedgePath(
                Math.max(0, targetPosition - 6),
                Math.min(180, targetPosition + 6),
                RADIUS - 2,
                INNER_RADIUS - 25
              )}
              fill="#FF9800"
            />
            {/* 4pt zone (bullseye) */}
            <motion.path
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.55 }}
              transition={{ duration: 0.4, delay: 0.9 }}
              d={wedgePath(
                Math.max(0, targetPosition - 2),
                Math.min(180, targetPosition + 2),
                RADIUS - 2,
                INNER_RADIUS - 25
              )}
              fill="#FFD700"
            />
          </motion.g>
        )}

        {/* Target line (reveal) */}
        {showScoringWedge && hasTarget && (
          <>
            <motion.line
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 1.0 }}
              x1={CENTER_X}
              y1={CENTER_Y}
              x2={posOnArc(targetPosition, RADIUS + 10).x}
              y2={posOnArc(targetPosition, RADIUS + 10).y}
              stroke="#FFD700"
              strokeWidth={3}
              strokeLinecap="round"
            />
            {/* Target pip */}
            <motion.circle
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", delay: 1.0, stiffness: 300 }}
              cx={posOnArc(targetPosition, RADIUS + 14).x}
              cy={posOnArc(targetPosition, RADIUS + 14).y}
              r={7}
              fill="#FFD700"
              stroke="white"
              strokeWidth={2}
            />
          </>
        )}

        {/* Target position indicator (clue phase — shown to clue-giver) */}
        {hasTarget && !showScoringWedge && (
          <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <line
              x1={CENTER_X}
              y1={CENTER_Y}
              x2={posOnArc(targetPosition, RADIUS + 8).x}
              y2={posOnArc(targetPosition, RADIUS + 8).y}
              stroke="#E8553A"
              strokeWidth={3}
              strokeDasharray="6 4"
              strokeLinecap="round"
            />
            <circle
              cx={posOnArc(targetPosition, RADIUS + 14).x}
              cy={posOnArc(targetPosition, RADIUS + 14).y}
              r={7}
              fill="#E8553A"
              stroke="white"
              strokeWidth={2}
            />
          </motion.g>
        )}

        {/* Player arrows */}
        {playerArrows.map((arrow) => (
          <AnimatedArrow
            key={arrow.id}
            arrow={arrow}
            showScore={!!showScoringWedge}
            targetPosition={targetPosition}
          />
        ))}

        {/* My guess pointer */}
        {myPosition !== undefined && interactive && (() => {
          const tip = posOnArc(myPosition, RADIUS - 5);
          return (
            <g>
              <motion.line
                x1={CENTER_X}
                y1={CENTER_Y}
                animate={{ x2: tip.x, y2: tip.y }}
                transition={{ type: "spring", stiffness: 200, damping: 25 }}
                stroke={lockedIn ? "#4CAF50" : "#2D2D2D"}
                strokeWidth={4}
                strokeLinecap="round"
              />
              <motion.circle
                animate={{ cx: tip.x, cy: tip.y }}
                transition={{ type: "spring", stiffness: 200, damping: 25 }}
                r={13}
                fill={
                  lockedIn ? "#4CAF50" : isDragging ? "#E8553A" : "#2D2D2D"
                }
                stroke="white"
                strokeWidth={3}
                style={{
                  filter: isDragging
                    ? "drop-shadow(0 2px 8px rgba(0,0,0,0.3))"
                    : "none",
                }}
              />
            </g>
          );
        })()}

        {/* Center dot */}
        <circle cx={CENTER_X} cy={CENTER_Y} r={5} fill="#DDD" />
        <circle cx={CENTER_X} cy={CENTER_Y} r={2} fill="#BBB" />
      </svg>

      {/* Labels */}
      <div className="-mt-1 flex w-full max-w-[420px] justify-between px-1">
        <span className="max-w-[40%] text-sm font-semibold text-text-secondary">
          {leftLabel}
        </span>
        <span className="max-w-[40%] text-right text-sm font-semibold text-text-secondary">
          {rightLabel}
        </span>
      </div>
    </div>
  );
}
