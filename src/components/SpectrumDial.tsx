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

function piePath(
  centerX: number,
  centerY: number,
  startDeg: number,
  endDeg: number,
  r: number
): string {
  const s = posOnArc(startDeg, r);
  const e = posOnArc(endDeg, r);
  const largeArc = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  return `M ${centerX} ${centerY} L ${s.x} ${s.y} A ${r} ${r} 0 ${largeArc} 1 ${e.x} ${e.y} Z`;
}

function getScore(guessDeg: number, targetDeg: number): number {
  const diff = Math.abs(guessDeg - targetDeg);
  if (diff <= 5) return 4;
  if (diff <= 10) return 3;
  if (diff <= 15) return 2;
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
  const tipPos = posOnArc(arrow.position, RADIUS - 8);
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
        opacity={arrow.lockedIn ? 0.5 : 0.25}
      />

      {/* Floating score on reveal */}
      {showScore && scored && (
        <motion.text
          initial={{ opacity: 0, y: tipPos.y }}
          animate={{ opacity: [0, 1, 1, 0], y: tipPos.y - 25 }}
          transition={{ delay: 1.5, duration: 1.5 }}
          x={tipPos.x}
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
  // Raw pointer position in SVG-space during drag (null when not dragging)
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [justLanded, setJustLanded] = useState(false);

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
      const rawAngle = Math.atan2(y, x) * (180 / Math.PI);
      // Flip: atan2 gives 0°=right, but our dial maps 0°=left
      const angle = 180 - rawAngle;
      const clamped = Math.max(5, Math.min(175, angle));
      return Math.round(clamped);
    },
    []
  );

  const clientToSvg = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      if (!svgRef.current) return null;
      const rect = svgRef.current.getBoundingClientRect();
      const scaleX = rect.width / SIZE;
      const scaleY = rect.height / (SIZE - 20);
      let x = (clientX - rect.left) / scaleX;
      let y = (clientY - rect.top) / scaleY;

      // Soft-constrain: allow up to 50% beyond viewBox, then rubber-band
      const margin = SIZE * 0.5;
      const clampWithRubberBand = (val: number, min: number, max: number) => {
        if (val < min - margin) return min - margin + (val - (min - margin)) * 0.2;
        if (val > max + margin) return max + margin + (val - (max + margin)) * 0.2;
        return val;
      };
      x = clampWithRubberBand(x, 0, SIZE);
      y = clampWithRubberBand(y, 0, SIZE - 20);

      return { x, y };
    },
    []
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!interactive || lockedIn) return;
      e.preventDefault();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      setIsDragging(true);
      const svgPos = clientToSvg(e.clientX, e.clientY);
      if (svgPos) setDragPos(svgPos);
      const angle = getAngleFromEvent(e.clientX, e.clientY);
      if (angle !== null) onPositionChange?.(angle);
    },
    [interactive, lockedIn, getAngleFromEvent, clientToSvg, onPositionChange]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging || !interactive || lockedIn) return;
      const svgPos = clientToSvg(e.clientX, e.clientY);
      if (svgPos) setDragPos(svgPos);
      const angle = getAngleFromEvent(e.clientX, e.clientY);
      if (angle !== null) onPositionChange?.(angle);
    },
    [isDragging, interactive, lockedIn, getAngleFromEvent, clientToSvg, onPositionChange]
  );

  const handlePointerUp = useCallback(() => {
    if (isDragging) {
      setJustLanded(true);
      setTimeout(() => setJustLanded(false), 400);
    }
    setIsDragging(false);
    setDragPos(null);
  }, [isDragging]);

  const isFreeDragging = isDragging && dragPos !== null;

  const arcStart = posOnArc(0, RADIUS);
  const arcEnd = posOnArc(180, RADIUS);
  const arcPath = `M ${arcStart.x} ${arcStart.y} A ${RADIUS} ${RADIUS} 0 0 1 ${arcEnd.x} ${arcEnd.y}`;

  // Background fill for the semicircle area
  const bgArcPath = `M ${arcStart.x} ${arcStart.y} A ${RADIUS} ${RADIUS} 0 0 1 ${arcEnd.x} ${arcEnd.y} L ${CENTER_X} ${CENTER_Y} Z`;

  return (
    <div className="flex flex-col items-center overflow-visible">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SIZE} ${SIZE - 20}`}
        className="w-full max-w-[420px] touch-none select-none"
        style={{ overflow: "visible" }}
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

        {/* Scoring wedge — radial pie slices from center (reveal) */}
        {showScoringWedge && hasTarget && (
          <motion.g
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.5 }}
          >
            {/* 2pt zone — outermost */}
            <motion.path
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.2 }}
              transition={{ duration: 0.4, delay: 0.5 }}
              d={piePath(
                CENTER_X,
                CENTER_Y,
                Math.max(0, targetPosition - 15),
                Math.min(180, targetPosition + 15),
                RADIUS + 2
              )}
              fill="#FF7043"
            />
            {/* 3pt zone */}
            <motion.path
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.3 }}
              transition={{ duration: 0.4, delay: 0.7 }}
              d={piePath(
                CENTER_X,
                CENTER_Y,
                Math.max(0, targetPosition - 10),
                Math.min(180, targetPosition + 10),
                RADIUS + 2
              )}
              fill="#FF9800"
            />
            {/* 4pt zone (bullseye) */}
            <motion.path
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              transition={{ duration: 0.4, delay: 0.9 }}
              d={piePath(
                CENTER_X,
                CENTER_Y,
                Math.max(0, targetPosition - 5),
                Math.min(180, targetPosition + 5),
                RADIUS + 2
              )}
              fill="#FFD700"
            />
            {/* Target line */}
            <motion.line
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 1.0 }}
              x1={CENTER_X}
              y1={CENTER_Y}
              x2={posOnArc(targetPosition, RADIUS + 12).x}
              y2={posOnArc(targetPosition, RADIUS + 12).y}
              stroke="#FFD700"
              strokeWidth={3}
              strokeLinecap="round"
            />
          </motion.g>
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
          const arcTip = posOnArc(myPosition, RADIUS - 5);

          // Where the ball actually renders: free position during drag, arc during rest
          const ballX = isFreeDragging ? dragPos!.x : arcTip.x;
          const ballY = isFreeDragging ? dragPos!.y : arcTip.y;
          const ballRadius = isFreeDragging ? 16 : 13;

          return (
            <g>
              {/* Ghost dot on arc — visible only during free drag */}
              {isFreeDragging && (
                <circle
                  cx={arcTip.x}
                  cy={arcTip.y}
                  r={6}
                  fill={lockedIn ? "#4CAF50" : "#2D2D2D"}
                  opacity={0.25}
                />
              )}

              {/* Line from center to ball */}
              {isFreeDragging ? (
                /* Rubber band line — dashed, lighter during free drag */
                <line
                  x1={CENTER_X}
                  y1={CENTER_Y}
                  x2={dragPos!.x}
                  y2={dragPos!.y}
                  stroke={lockedIn ? "#4CAF50" : "#2D2D2D"}
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  opacity={0.2}
                  strokeLinecap="round"
                />
              ) : (
                /* Normal solid line when resting on arc */
                <motion.line
                  x1={CENTER_X}
                  y1={CENTER_Y}
                  animate={{ x2: arcTip.x, y2: arcTip.y }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  stroke={lockedIn ? "#4CAF50" : "#2D2D2D"}
                  strokeWidth={4}
                  strokeLinecap="round"
                />
              )}

              {/* The ball itself */}
              <motion.circle
                animate={{
                  cx: ballX,
                  cy: ballY,
                  r: justLanded ? [ballRadius * 1.3, ballRadius] : ballRadius,
                }}
                transition={
                  isFreeDragging
                    ? { type: "tween", duration: 0 }
                    : { type: "spring", stiffness: 300, damping: 20 }
                }
                fill={
                  lockedIn ? "#4CAF50" : isFreeDragging ? "#E8553A" : "#2D2D2D"
                }
                stroke="white"
                strokeWidth={3}
                style={{
                  filter: isFreeDragging
                    ? "drop-shadow(0 4px 12px rgba(0,0,0,0.3))"
                    : justLanded
                      ? "drop-shadow(0 2px 6px rgba(0,0,0,0.2))"
                      : "none",
                }}
              />

              {/* Faint line from center to ghost dot during drag */}
              {isFreeDragging && (
                <line
                  x1={CENTER_X}
                  y1={CENTER_Y}
                  x2={arcTip.x}
                  y2={arcTip.y}
                  stroke={lockedIn ? "#4CAF50" : "#2D2D2D"}
                  strokeWidth={2}
                  opacity={0.12}
                  strokeLinecap="round"
                />
              )}

              {/* Landing pulse ring — appears briefly when ball snaps back */}
              {justLanded && (
                <motion.circle
                  cx={arcTip.x}
                  cy={arcTip.y}
                  initial={{ r: 6, opacity: 0.4 }}
                  animate={{ r: 24, opacity: 0 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  fill="none"
                  stroke={lockedIn ? "#4CAF50" : "#E8553A"}
                  strokeWidth={2}
                />
              )}
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
