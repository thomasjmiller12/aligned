"use client";

import { useCallback, useRef, useState } from "react";
import { motion } from "framer-motion";
import { SCORE_ZONES } from "@/lib/scoring";

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
  onDragMove?: (clientX: number, clientY: number) => void;
  onDragEnd?: () => void;
}

const SIZE = 340;
const CENTER_X = SIZE / 2;
const CENTER_Y = SIZE - 30;
const RADIUS = SIZE / 2 - 40;
const VB_Y_OFFSET = 100;
const VB_HEIGHT = SIZE - 120;
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

function arcBandPath(startDeg: number, endDeg: number, r: number): string {
  const s = posOnArc(startDeg, r);
  const e = posOnArc(endDeg, r);
  const largeArc = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${largeArc} 1 ${e.x} ${e.y}`;
}

function getScore(guessDeg: number, targetDeg: number): number {
  const diff = Math.abs(guessDeg - targetDeg);
  if (diff <= SCORE_ZONES.BULLSEYE) return 4;
  if (diff <= SCORE_ZONES.CLOSE) return 3;
  if (diff <= SCORE_ZONES.NEAR) return 2;
  return 0;
}

function AnimatedArrow({
  arrow,
  showScore,
  targetPosition,
  scoreYOffset,
}: {
  arrow: PlayerArrow;
  showScore: boolean;
  targetPosition?: number;
  scoreYOffset: number;
}) {
  const tipPos = posOnArc(arrow.position, RADIUS - 8);
  const validTarget =
    targetPosition !== undefined && targetPosition >= 0;
  const score =
    showScore && validTarget
      ? getScore(arrow.position, targetPosition)
      : 0;
  const scored = score > 0;

  const dotPos = posOnArc(arrow.position, RADIUS + 18);

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
        opacity={arrow.lockedIn ? 0.5 : 0.3}
      />

      {/* Player dot at arrow tip */}
      <motion.circle
        animate={{ cx: dotPos.x, cy: dotPos.y }}
        transition={{ type: "spring", stiffness: 120, damping: 20 }}
        r={11}
        fill={arrow.color}
        stroke="white"
        strokeWidth={2}
      />
      <motion.text
        animate={{ x: dotPos.x, y: dotPos.y + 4 }}
        transition={{ type: "spring", stiffness: 120, damping: 20 }}
        textAnchor="middle"
        fill="white"
        fontSize={11}
        fontWeight="bold"
      >
        {arrow.initial}
      </motion.text>

      {/* Floating score on reveal — offset to avoid overlap with nearby arrows */}
      {showScore && (
        <motion.g
          initial={{ opacity: 0, y: 0 }}
          animate={{ opacity: 1, y: -8 }}
          transition={{ delay: 0.6, duration: 0.4, ease: "easeOut" }}
        >
          <motion.text
            x={dotPos.x}
            y={dotPos.y - 16 + scoreYOffset}
            textAnchor="middle"
            fill={scored
              ? (score === 4 ? "#FBBF24" : score === 3 ? "#2DD4BF" : "#A7F3D0")
              : "#999"
            }
            fontSize={scored ? 13 : 11}
            fontWeight="bold"
          >
            {scored ? `+${score}` : "Miss"}
          </motion.text>
        </motion.g>
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
  onDragMove,
  onDragEnd,
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
      const scaleY = rect.height / VB_HEIGHT;
      const x = (clientX - rect.left) / scaleX - CENTER_X;
      const y = CENTER_Y - ((clientY - rect.top) / scaleY + VB_Y_OFFSET);
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
      const scaleY = rect.height / VB_HEIGHT;
      let x = (clientX - rect.left) / scaleX;
      let y = (clientY - rect.top) / scaleY + VB_Y_OFFSET;

      // Soft-constrain: allow up to 50% beyond viewBox, then rubber-band
      const margin = SIZE * 0.5;
      const clampWithRubberBand = (val: number, min: number, max: number) => {
        if (val < min - margin) return min - margin + (val - (min - margin)) * 0.2;
        if (val > max + margin) return max + margin + (val - (max + margin)) * 0.2;
        return val;
      };
      x = clampWithRubberBand(x, 0, SIZE);
      y = clampWithRubberBand(y, VB_Y_OFFSET, VB_Y_OFFSET + VB_HEIGHT);

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
      if (navigator.vibrate) navigator.vibrate(10);
      const svgPos = clientToSvg(e.clientX, e.clientY);
      if (svgPos) setDragPos(svgPos);
      const angle = getAngleFromEvent(e.clientX, e.clientY);
      if (angle !== null) onPositionChange?.(angle);
      onDragMove?.(e.clientX, e.clientY);
    },
    [interactive, lockedIn, getAngleFromEvent, clientToSvg, onPositionChange, onDragMove]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging || !interactive || lockedIn) return;
      const svgPos = clientToSvg(e.clientX, e.clientY);
      if (svgPos) setDragPos(svgPos);
      const angle = getAngleFromEvent(e.clientX, e.clientY);
      if (angle !== null) onPositionChange?.(angle);
      onDragMove?.(e.clientX, e.clientY);
    },
    [isDragging, interactive, lockedIn, getAngleFromEvent, clientToSvg, onPositionChange, onDragMove]
  );

  const handlePointerUp = useCallback(() => {
    if (isDragging && dragPos) {
      // Only trigger landing animation for real drags (moved significantly from arc)
      const arcTip = myPosition !== undefined ? posOnArc(myPosition, RADIUS - 5) : null;
      const dist = arcTip
        ? Math.hypot(dragPos.x - arcTip.x, dragPos.y - arcTip.y)
        : 0;
      if (dist > 15) {
        setJustLanded(true);
        setTimeout(() => setJustLanded(false), 400);
        if (navigator.vibrate) navigator.vibrate([15, 30, 10]);
      }
    }
    setIsDragging(false);
    setDragPos(null);
    onDragEnd?.();
  }, [isDragging, dragPos, myPosition, onDragEnd]);

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
        viewBox={`0 ${VB_Y_OFFSET} ${SIZE} ${VB_HEIGHT}`}
        className="w-full max-w-[420px] touch-none select-none"
        style={{ overflow: "visible" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <defs>
          <radialGradient id="bgGlow" cx="50%" cy="100%" r="80%" fx="50%" fy="100%">
            <stop offset="0%" stopColor="#F5E6D3" stopOpacity={0.4} />
            <stop offset="60%" stopColor="#FFF8F0" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#FFF8F0" stopOpacity={0.08} />
          </radialGradient>
        </defs>

        {/* Subtle warm cream gradient fill across semicircle */}
        <path d={bgArcPath} fill="url(#bgGlow)" />

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

        {/* Main arc — neutral tone, scoring zones are the visual focus */}
        <path
          d={arcPath}
          fill="none"
          stroke="#D4C4B0"
          strokeWidth={10}
          strokeLinecap="round"
          opacity={0.5}
        />

        {/* Arc highlight near ghost position during drag */}
        {isFreeDragging && myPosition !== undefined && (() => {
          const glowStart = Math.max(0, myPosition - 12);
          const glowEnd = Math.min(180, myPosition + 12);
          const gs = posOnArc(glowStart, RADIUS);
          const ge = posOnArc(glowEnd, RADIUS);
          const glowPath = `M ${gs.x} ${gs.y} A ${RADIUS} ${RADIUS} 0 0 1 ${ge.x} ${ge.y}`;
          return (
            <path
              d={glowPath}
              fill="none"
              stroke="#E8553A"
              strokeWidth={14}
              strokeLinecap="round"
              opacity={0.15}
            />
          );
        })()}


        {/* Scoring zones — arc band wedges, progressive reveal from center (reveal) */}
        {showScoringWedge && hasTarget && (() => {
          const tp = targetPosition!;
          const R_OUTER = RADIUS + 5;
          const R_INNER = RADIUS - 5;
          // Order: 4pt center first, then 3pt pair, then 2pt pair
          const B = SCORE_ZONES.BULLSEYE;
          const C = SCORE_ZONES.CLOSE;
          const N = SCORE_ZONES.NEAR;
          const zones = [
            { from: -B, to: B, color: "#FBBF24", opacity: 1, delay: 0.1 },
            { from: -C, to: -B, color: "#2DD4BF", opacity: 1, delay: 0.22 },
            { from: B, to: C, color: "#2DD4BF", opacity: 1, delay: 0.22 },
            { from: -N, to: -C, color: "#A7F3D0", opacity: 1, delay: 0.34 },
            { from: C, to: N, color: "#A7F3D0", opacity: 1, delay: 0.34 },
          ];
          function bandPath(fromDeg: number, toDeg: number) {
            const s = Math.max(0, tp + fromDeg);
            const e = Math.min(180, tp + toDeg);
            if (s >= e) return null;
            const oS = posOnArc(s, R_OUTER);
            const oE = posOnArc(e, R_OUTER);
            const iS = posOnArc(s, R_INNER);
            const iE = posOnArc(e, R_INNER);
            const la = (e - s) > 180 ? 1 : 0;
            return `M ${oS.x} ${oS.y} A ${R_OUTER} ${R_OUTER} 0 ${la} 1 ${oE.x} ${oE.y} L ${iE.x} ${iE.y} A ${R_INNER} ${R_INNER} 0 ${la} 0 ${iS.x} ${iS.y} Z`;
          }
          return (
            <motion.g>
              {zones.map((z, i) => {
                const d = bandPath(z.from, z.to);
                if (!d) return null;
                return (
                  <motion.path
                    key={i}
                    initial={{ opacity: 0, pathLength: 0 }}
                    animate={{ opacity: z.opacity, pathLength: 1 }}
                    transition={{ duration: 0.3, delay: z.delay, ease: "easeOut" }}
                    d={d}
                    fill={z.color}
                  />
                );
              })}
            </motion.g>
          );
        })()}

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

        {/* Player arrows — compute Y offsets to prevent overlapping score labels */}
        {(() => {
          const sorted = [...playerArrows].sort((a, b) => a.position - b.position);
          const offsets = new Map<string, number>();
          const MIN_DEG_GAP = 8;
          for (let i = 0; i < sorted.length; i++) {
            let yOff = 0;
            for (let j = 0; j < i; j++) {
              if (Math.abs(sorted[i].position - sorted[j].position) < MIN_DEG_GAP) {
                yOff -= 14;
              }
            }
            offsets.set(sorted[i].id, yOff);
          }
          return playerArrows.map((arrow) => (
            <AnimatedArrow
              key={arrow.id}
              arrow={arrow}
              showScore={!!showScoringWedge}
              targetPosition={targetPosition}
              scoreYOffset={offsets.get(arrow.id) ?? 0}
            />
          ));
        })()}

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
      <div className="-mt-3 flex w-full max-w-[420px] justify-between px-1">
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
