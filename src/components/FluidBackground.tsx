"use client";

import { useEffect, useRef, useCallback } from "react";

// --- Types ---

interface TrailPoint {
  x: number;
  y: number;
  time: number; // performance.now()
  pressed: boolean; // pointer was down when this point was created
}

interface BurstParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // 1 → 0
  size: number;
  color: string;
}

interface PlayerState {
  lastKnownX: number;
  lastKnownY: number;
  interpX: number;
  interpY: number;
  color: string;
  trail: TrailPoint[];
  lastBurstAt?: number;
}

interface FluidBackgroundProps {
  /** Remote players' presence data from Convex */
  remotePresence?: Array<{
    playerId: string;
    x: number; // 0-1 normalized
    y: number; // 0-1 normalized
    color: string;
    burstAt?: number;
  }>;
  /** Called when local player moves (throttled by component) */
  onLocalMove?: (x: number, y: number) => void;
  /** Called when local player taps/clicks (burst event) */
  onLocalBurst?: (x: number, y: number) => void;
  /** The local player's color */
  playerColor?: string;
  /** Whether touch interaction is enabled */
  interactive?: boolean;
  /** Getter for external pointer position (e.g. dial drag) — called each frame */
  getExternalPointerPos?: () => { x: number; y: number } | null;
}

// --- Constants ---

// Lava-lamp blobs — warm oranges, teals, and peach tones
const LAVA_BLOBS: Array<{
  color: [number, number, number]; // RGB
  baseOpacity: number;
  baseRadius: number;
  x: number;
  y: number;
  // Movement frequencies (radians per second)
  freqX1: number;
  freqY1: number;
  freqX2: number;
  freqY2: number;
  // Movement amplitudes (fraction of screen)
  ampX1: number;
  ampY1: number;
  ampX2: number;
  ampY2: number;
  // Pulse (breathing) frequency and amplitude
  pulseFreq: number;
  pulseAmp: number; // fraction of baseRadius
  // Opacity drift
  opacityFreq: number;
  opacityAmp: number; // fraction of baseOpacity
  phase: number; // initial phase offset
}> = [
  // Large warm orange — slow drifter
  {
    color: [232, 85, 58], baseOpacity: 0.28, baseRadius: 420,
    x: 0.25, y: 0.3,
    freqX1: 0.08, freqY1: 0.06, freqX2: 0.03, freqY2: 0.05,
    ampX1: 0.18, ampY1: 0.15, ampX2: 0.1, ampY2: 0.08,
    pulseFreq: 0.15, pulseAmp: 0.3,
    opacityFreq: 0.1, opacityAmp: 0.4, phase: 0,
  },
  // Large teal — counterpoint
  {
    color: [42, 157, 143], baseOpacity: 0.25, baseRadius: 400,
    x: 0.7, y: 0.6,
    freqX1: 0.07, freqY1: 0.09, freqX2: 0.04, freqY2: 0.02,
    ampX1: 0.2, ampY1: 0.18, ampX2: 0.08, ampY2: 0.1,
    pulseFreq: 0.12, pulseAmp: 0.35,
    opacityFreq: 0.08, opacityAmp: 0.45, phase: 1.2,
  },
  // Medium peach/coral — warm accent
  {
    color: [244, 162, 97], baseOpacity: 0.22, baseRadius: 350,
    x: 0.5, y: 0.2,
    freqX1: 0.1, freqY1: 0.07, freqX2: 0.05, freqY2: 0.04,
    ampX1: 0.22, ampY1: 0.18, ampX2: 0.12, ampY2: 0.08,
    pulseFreq: 0.18, pulseAmp: 0.25,
    opacityFreq: 0.13, opacityAmp: 0.35, phase: 2.5,
  },
  // Small deep orange — fast mover
  {
    color: [220, 100, 50], baseOpacity: 0.2, baseRadius: 280,
    x: 0.15, y: 0.7,
    freqX1: 0.12, freqY1: 0.1, freqX2: 0.06, freqY2: 0.08,
    ampX1: 0.25, ampY1: 0.2, ampX2: 0.14, ampY2: 0.1,
    pulseFreq: 0.2, pulseAmp: 0.4,
    opacityFreq: 0.15, opacityAmp: 0.5, phase: 3.8,
  },
  // Medium teal-green — rises and sinks
  {
    color: [30, 140, 130], baseOpacity: 0.2, baseRadius: 330,
    x: 0.8, y: 0.25,
    freqX1: 0.06, freqY1: 0.11, freqX2: 0.03, freqY2: 0.07,
    ampX1: 0.15, ampY1: 0.22, ampX2: 0.1, ampY2: 0.14,
    pulseFreq: 0.14, pulseAmp: 0.32,
    opacityFreq: 0.11, opacityAmp: 0.42, phase: 5.0,
  },
  // Soft warm glow — large and slow
  {
    color: [255, 200, 160], baseOpacity: 0.18, baseRadius: 500,
    x: 0.4, y: 0.8,
    freqX1: 0.05, freqY1: 0.04, freqX2: 0.02, freqY2: 0.03,
    ampX1: 0.18, ampY1: 0.12, ampX2: 0.08, ampY2: 0.06,
    pulseFreq: 0.08, pulseAmp: 0.25,
    opacityFreq: 0.06, opacityAmp: 0.35, phase: 0.7,
  },
  // Small bright teal — quick drifter
  {
    color: [50, 180, 165], baseOpacity: 0.18, baseRadius: 250,
    x: 0.6, y: 0.45,
    freqX1: 0.14, freqY1: 0.09, freqX2: 0.07, freqY2: 0.05,
    ampX1: 0.22, ampY1: 0.18, ampX2: 0.12, ampY2: 0.1,
    pulseFreq: 0.22, pulseAmp: 0.35,
    opacityFreq: 0.16, opacityAmp: 0.45, phase: 4.2,
  },
  // Deep warm red — background anchor
  {
    color: [200, 60, 40], baseOpacity: 0.14, baseRadius: 550,
    x: 0.35, y: 0.5,
    freqX1: 0.04, freqY1: 0.03, freqX2: 0.02, freqY2: 0.015,
    ampX1: 0.12, ampY1: 0.1, ampX2: 0.06, ampY2: 0.05,
    pulseFreq: 0.06, pulseAmp: 0.2,
    opacityFreq: 0.05, opacityAmp: 0.3, phase: 1.8,
  },
];

const TRAIL_MAX_POINTS = 15;
const TRAIL_MAX_AGE = 600; // ms
const TRAIL_HEAD_SIZE = 5;
const TRAIL_HEAD_OPACITY = 0.5;
const REMOTE_TRAIL_OPACITY = 0.35;

const BURST_PARTICLE_COUNT = 16;
const BURST_LIFETIME = 0.55; // seconds
const BURST_SPEED = 180; // px/sec
const BURST_GRAVITY = 140; // px/sec^2

const LERP_FACTOR = 0.15;
const PRESENCE_SEND_INTERVAL = 150; // ms

// --- Component ---

export default function FluidBackground({
  remotePresence = [],
  onLocalMove,
  onLocalBurst,
  playerColor = "#E8553A",
  interactive = true,
  getExternalPointerPos,
}: FluidBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null); // blurred lava layer
  const fxCanvasRef = useRef<HTMLCanvasElement>(null); // sharp trails/particles layer
  const localTrailRef = useRef<TrailPoint[]>([]);
  const burstParticlesRef = useRef<BurstParticle[]>([]);
  const playersRef = useRef<Map<string, PlayerState>>(new Map());
  const animFrameRef = useRef<number>(0);
  const lastSendTime = useRef<number>(0);
  const lastFrameTime = useRef<number>(0);
  const pointerDownRef = useRef(false);
  const prefersReducedMotion = useRef(false);

  // Store latest props in refs for use in listeners/animation loop
  const playerColorRef = useRef(playerColor);
  const onLocalMoveRef = useRef(onLocalMove);
  const onLocalBurstRef = useRef(onLocalBurst);
  const interactiveRef = useRef(interactive);
  const getExternalPointerPosRef = useRef(getExternalPointerPos);
  playerColorRef.current = playerColor;
  onLocalMoveRef.current = onLocalMove;
  onLocalBurstRef.current = onLocalBurst;
  interactiveRef.current = interactive;
  getExternalPointerPosRef.current = getExternalPointerPos;

  // --- Helpers ---

  const addLocalTrailPoint = useCallback((x: number, y: number, pressed?: boolean) => {
    const trail = localTrailRef.current;
    const now = performance.now();
    // Skip if too close to last point
    const last = trail[trail.length - 1];
    if (last && Math.hypot(x - last.x, y - last.y) < 3) return;
    trail.push({ x, y, time: now, pressed: pressed ?? pointerDownRef.current });
    if (trail.length > TRAIL_MAX_POINTS) {
      localTrailRef.current = trail.slice(-TRAIL_MAX_POINTS);
    }
  }, []);

  const throttleSendPresence = useCallback((x: number, y: number) => {
    const now = performance.now();
    if (now - lastSendTime.current < PRESENCE_SEND_INTERVAL) return;
    lastSendTime.current = now;
    onLocalMoveRef.current?.(x / window.innerWidth, y / window.innerHeight);
  }, []);

  const spawnBurst = useCallback(
    (x: number, y: number, color: string, opacityMul: number) => {
      const particles = burstParticlesRef.current;
      for (let i = 0; i < BURST_PARTICLE_COUNT; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = BURST_SPEED * (0.4 + Math.random() * 0.6);
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 40, // slight upward bias
          life: opacityMul,
          size: 3 + Math.random() * 4,
          color,
        });
      }
      // Cap particles
      if (particles.length > 120) {
        burstParticlesRef.current = particles.slice(-80);
      }
    },
    []
  );

  // --- Initialize orbs + reduced motion ---

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    prefersReducedMotion.current = mq.matches;
    const handler = (e: MediaQueryListEvent) => {
      prefersReducedMotion.current = e.matches;
    };
    mq.addEventListener("change", handler);

    return () => mq.removeEventListener("change", handler);
  }, []);

  // --- Process remote presence updates ---

  useEffect(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const players = playersRef.current;
    const activeIds = new Set<string>();

    for (const rp of remotePresence) {
      activeIds.add(rp.playerId);

      let state = players.get(rp.playerId);
      if (!state) {
        state = {
          lastKnownX: rp.x * w,
          lastKnownY: rp.y * h,
          interpX: rp.x * w,
          interpY: rp.y * h,
          color: rp.color,
          trail: [],
        };
        players.set(rp.playerId, state);
      } else {
        state.lastKnownX = rp.x * w;
        state.lastKnownY = rp.y * h;
        state.color = rp.color;
      }

      // Detect new burst
      if (rp.burstAt && rp.burstAt !== state.lastBurstAt) {
        state.lastBurstAt = rp.burstAt;
        spawnBurst(rp.x * w, rp.y * h, rp.color, 0.5);
      }
    }

    // Remove players who left
    for (const [id] of players) {
      if (!activeIds.has(id)) players.delete(id);
    }
  }, [remotePresence, spawnBurst]);

  // --- Document-level pointer listeners ---

  useEffect(() => {
    function isUIElement(el: Element | null): boolean {
      if (!el) return false;
      return !!(
        (el as HTMLElement).closest("button") ||
        (el as HTMLElement).closest("input") ||
        (el as HTMLElement).closest("textarea") ||
        (el as HTMLElement).closest("svg") ||
        (el as HTMLElement).closest("a") ||
        (el as HTMLElement).closest("[data-no-ripple]")
      );
    }

    function shouldSkip(e: PointerEvent): boolean {
      return isUIElement(e.target as Element);
    }

    // Prevent browser from hijacking touch gestures on the background.
    // Without this, mobile browsers cancel pointer events after ~150ms
    // to start scrolling/panning, which kills the trail mid-drag.
    function handleTouchMove(e: TouchEvent) {
      if (!interactiveRef.current) return;
      if (isUIElement(e.target as Element)) return;
      e.preventDefault();
    }

    function handlePointerDown(e: PointerEvent) {
      pointerDownRef.current = true;
      if (!interactiveRef.current || shouldSkip(e)) return;
      addLocalTrailPoint(e.clientX, e.clientY, true);
      spawnBurst(e.clientX, e.clientY, playerColorRef.current, 0.7);
      onLocalBurstRef.current?.(
        e.clientX / window.innerWidth,
        e.clientY / window.innerHeight
      );
      throttleSendPresence(e.clientX, e.clientY);
    }

    function handlePointerUp() {
      pointerDownRef.current = false;
    }

    function handlePointerMove(e: PointerEvent) {
      if (!interactiveRef.current || shouldSkip(e)) return;
      addLocalTrailPoint(e.clientX, e.clientY);
      throttleSendPresence(e.clientX, e.clientY);
    }

    function handleDragStart(e: DragEvent) {
      e.preventDefault();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("dragstart", handleDragStart);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("dragstart", handleDragStart);
    };
  }, [addLocalTrailPoint, throttleSendPresence, spawnBurst]);

  // --- Animation loop ---

  useEffect(() => {
    const lavaCanvas = canvasRef.current;
    const fxCanvas = fxCanvasRef.current;
    if (!lavaCanvas || !fxCanvas) return;
    const lavaCtx = lavaCanvas.getContext("2d");
    const fxCtx = fxCanvas.getContext("2d");
    if (!lavaCtx || !fxCtx) return;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const w = window.innerWidth;
      const h = window.innerHeight;
      // Lava layer: render at half res for performance (blur hides detail anyway)
      lavaCanvas!.width = Math.round(w * dpr * 0.5);
      lavaCanvas!.height = Math.round(h * dpr * 0.5);
      lavaCtx!.setTransform(dpr * 0.5, 0, 0, dpr * 0.5, 0, 0);
      // FX layer: full res
      fxCanvas!.width = w * dpr;
      fxCanvas!.height = h * dpr;
      fxCtx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    resize();
    window.addEventListener("resize", resize);

    let slowFrameCount = 0;

    function draw(now: number) {
      const dt = lastFrameTime.current
        ? Math.min((now - lastFrameTime.current) / 1000, 0.05) // cap at 50ms
        : 0.016;
      lastFrameTime.current = now;

      const w = window.innerWidth;
      const h = window.innerHeight;
      lavaCtx!.clearRect(0, 0, w, h);
      fxCtx!.clearRect(0, 0, w, h);

      // --- External pointer (dial drag) ---
      const extPos = getExternalPointerPosRef.current?.();
      if (extPos) {
        addLocalTrailPoint(extPos.x, extPos.y);
        const sendNow = performance.now();
        if (sendNow - lastSendTime.current >= PRESENCE_SEND_INTERVAL) {
          lastSendTime.current = sendNow;
          onLocalMoveRef.current?.(extPos.x / w, extPos.y / h);
        }
      }

      // --- Lava-lamp blobs (drawn to blurred canvas) ---
      if (!prefersReducedMotion.current) {
        const t = now * 0.001;

        for (const blob of LAVA_BLOBS) {
          const ox = w * (
            blob.x
            + blob.ampX1 * Math.sin(t * blob.freqX1 + blob.phase)
            + blob.ampX2 * Math.sin(t * blob.freqX2 + blob.phase * 1.7)
          );
          const oy = h * (
            blob.y
            + blob.ampY1 * Math.cos(t * blob.freqY1 + blob.phase)
            + blob.ampY2 * Math.cos(t * blob.freqY2 + blob.phase * 2.3)
          );

          const radius = blob.baseRadius * (
            1 + blob.pulseAmp * Math.sin(t * blob.pulseFreq + blob.phase * 0.9)
          );

          const opacity = blob.baseOpacity * (
            1 + blob.opacityAmp * Math.sin(t * blob.opacityFreq + blob.phase * 1.3)
          );

          const [r, g, b] = blob.color;
          const grad = lavaCtx!.createRadialGradient(ox, oy, 0, ox, oy, radius);
          grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${opacity})`);
          grad.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, ${opacity * 0.6})`);
          grad.addColorStop(0.7, `rgba(${r}, ${g}, ${b}, ${opacity * 0.25})`);
          grad.addColorStop(1, "rgba(0,0,0,0)");
          lavaCtx!.fillStyle = grad;
          lavaCtx!.fillRect(
            ox - radius,
            oy - radius,
            radius * 2,
            radius * 2
          );
        }
      }

      // --- Remote player trails (drawn to sharp FX canvas) ---
      for (const [, state] of playersRef.current) {
        state.interpX += (state.lastKnownX - state.interpX) * LERP_FACTOR;
        state.interpY += (state.lastKnownY - state.interpY) * LERP_FACTOR;

        const lastPt = state.trail[state.trail.length - 1];
        if (
          !lastPt ||
          Math.hypot(state.interpX - lastPt.x, state.interpY - lastPt.y) > 2
        ) {
          state.trail.push({ x: state.interpX, y: state.interpY, time: now, pressed: true });
        }

        state.trail = state.trail.filter(
          (p) => now - p.time < TRAIL_MAX_AGE
        );
        if (state.trail.length > TRAIL_MAX_POINTS) {
          state.trail = state.trail.slice(-TRAIL_MAX_POINTS);
        }

        drawTrail(fxCtx!, state.trail, state.color, now, REMOTE_TRAIL_OPACITY);
      }

      // --- Local trail (drawn to sharp FX canvas) ---
      localTrailRef.current = localTrailRef.current.filter(
        (p) => now - p.time < TRAIL_MAX_AGE
      );
      if (localTrailRef.current.length > TRAIL_MAX_POINTS) {
        localTrailRef.current = localTrailRef.current.slice(-TRAIL_MAX_POINTS);
      }
      drawTrail(
        fxCtx!,
        localTrailRef.current,
        playerColorRef.current,
        now,
        TRAIL_HEAD_OPACITY
      );

      // --- Burst particles (drawn to sharp FX canvas) ---
      const alive: BurstParticle[] = [];
      for (const p of burstParticlesRef.current) {
        p.life -= dt / BURST_LIFETIME;
        if (p.life <= 0) continue;

        p.vy += BURST_GRAVITY * dt;
        p.vx *= 1 - 3 * dt;
        p.vy *= 1 - 3 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        const radius = p.size * Math.max(p.life, 0);
        if (radius < 0.3) continue;

        fxCtx!.beginPath();
        fxCtx!.arc(p.x, p.y, radius, 0, Math.PI * 2);
        fxCtx!.globalAlpha = Math.max(p.life, 0) * 0.8;
        fxCtx!.fillStyle = p.color;
        fxCtx!.fill();
        fxCtx!.globalAlpha = 1;

        alive.push(p);
      }
      burstParticlesRef.current = alive;

      // --- FPS guard ---
      const frameDuration = performance.now() - now;
      if (frameDuration > 32) {
        slowFrameCount++;
      } else {
        slowFrameCount = Math.max(0, slowFrameCount - 1);
      }

      animFrameRef.current = requestAnimationFrame(draw);
    }

    animFrameRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener("resize", resize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {/* Lava-lamp layer: blurred for diffused glow */}
      <canvas
        ref={canvasRef}
        className="pointer-events-none fixed inset-0 z-0"
        style={{ width: "100vw", height: "100vh", filter: "blur(80px)" }}
      />
      {/* FX layer: sharp trails and particles */}
      <canvas
        ref={fxCanvasRef}
        className="pointer-events-none fixed inset-0 z-0"
        style={{ width: "100vw", height: "100vh" }}
      />
    </>
  );
}

// --- Draw helpers ---

const PASSIVE_OPACITY_MUL = 0.45; // multiplier when hovering (not clicked)

function drawTrail(
  ctx: CanvasRenderingContext2D,
  trail: TrailPoint[],
  color: string,
  now: number,
  maxOpacity: number
) {
  if (trail.length < 2) return;

  // Draw connecting line segments (fading)
  for (let i = 1; i < trail.length; i++) {
    const prev = trail[i - 1];
    const curr = trail[i];
    const age = now - curr.time;
    const t = 1 - age / TRAIL_MAX_AGE; // 1 = new, 0 = old
    if (t < 0.05) continue;

    const pressedMul = curr.pressed ? 1 : PASSIVE_OPACITY_MUL;

    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(curr.x, curr.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = TRAIL_HEAD_SIZE * 2 * t;
    ctx.lineCap = "round";
    ctx.globalAlpha = maxOpacity * t * 0.6 * pressedMul;
    ctx.stroke();
  }

  // Draw dots at each point
  for (let i = 0; i < trail.length; i++) {
    const point = trail[i];
    const age = now - point.time;
    const t = 1 - age / TRAIL_MAX_AGE;
    if (t < 0.05) continue;

    const pressedMul = point.pressed ? 1 : PASSIVE_OPACITY_MUL;
    const size = TRAIL_HEAD_SIZE * t;
    ctx.beginPath();
    ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
    ctx.globalAlpha = maxOpacity * t * pressedMul;
    ctx.fillStyle = color;
    ctx.fill();
  }

  ctx.globalAlpha = 1;
}
