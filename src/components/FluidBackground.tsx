"use client";

import { useEffect, useRef, useCallback } from "react";

// --- Types ---

interface Orb {
  x: number;
  y: number;
  radius: number;
  color: string;
  phase: number;
  speedX: number;
  speedY: number;
}

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

const AMBIENT_COLORS = [
  "rgba(232, 85, 58, 0.10)", // primary
  "rgba(42, 157, 143, 0.10)", // accent
  "rgba(244, 162, 97, 0.08)", // secondary
  "rgba(124, 58, 237, 0.08)", // purple
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const orbsRef = useRef<Orb[]>([]);
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

    orbsRef.current = AMBIENT_COLORS.map((color, i) => ({
      x: 0.2 + i * 0.2,
      y: 0.3 + (i % 2) * 0.3,
      radius: 120 + Math.random() * 80,
      color,
      phase: (i * Math.PI) / 2,
      speedX: 0.0002 + Math.random() * 0.0003,
      speedY: 0.0003 + Math.random() * 0.0002,
    }));

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
    function shouldSkip(e: PointerEvent): boolean {
      const el = e.target as HTMLElement;
      return !!(
        el.closest("button") ||
        el.closest("input") ||
        el.closest("textarea") ||
        el.closest("svg") ||
        el.closest("a") ||
        el.closest("[data-no-ripple]")
      );
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
    document.addEventListener("dragstart", handleDragStart);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("dragstart", handleDragStart);
    };
  }, [addLocalTrailPoint, throttleSendPresence, spawnBurst]);

  // --- Animation loop ---

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      canvas!.width = window.innerWidth * dpr;
      canvas!.height = window.innerHeight * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
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
      ctx!.clearRect(0, 0, w, h);

      // --- External pointer (dial drag) ---
      const extPos = getExternalPointerPosRef.current?.();
      if (extPos) {
        addLocalTrailPoint(extPos.x, extPos.y);
        // Throttle presence sends for external pointer too
        const sendNow = performance.now();
        if (sendNow - lastSendTime.current >= PRESENCE_SEND_INTERVAL) {
          lastSendTime.current = sendNow;
          onLocalMoveRef.current?.(extPos.x / w, extPos.y / h);
        }
      }

      // --- Ambient orbs ---
      if (!prefersReducedMotion.current) {
        for (const orb of orbsRef.current) {
          const ox =
            w * (orb.x + 0.15 * Math.sin(now * orb.speedX + orb.phase));
          const oy =
            h * (orb.y + 0.1 * Math.cos(now * orb.speedY + orb.phase));
          const grad = ctx!.createRadialGradient(
            ox,
            oy,
            0,
            ox,
            oy,
            orb.radius
          );
          grad.addColorStop(0, orb.color);
          grad.addColorStop(1, "rgba(0,0,0,0)");
          ctx!.fillStyle = grad;
          ctx!.fillRect(
            ox - orb.radius,
            oy - orb.radius,
            orb.radius * 2,
            orb.radius * 2
          );
        }
      }

      // --- Remote player trails ---
      for (const [, state] of playersRef.current) {
        // Lerp toward last known position
        state.interpX += (state.lastKnownX - state.interpX) * LERP_FACTOR;
        state.interpY += (state.lastKnownY - state.interpY) * LERP_FACTOR;

        // Add to trail if moved enough
        const lastPt = state.trail[state.trail.length - 1];
        if (
          !lastPt ||
          Math.hypot(state.interpX - lastPt.x, state.interpY - lastPt.y) > 2
        ) {
          state.trail.push({ x: state.interpX, y: state.interpY, time: now, pressed: true });
        }

        // Age out old points
        state.trail = state.trail.filter(
          (p) => now - p.time < TRAIL_MAX_AGE
        );
        if (state.trail.length > TRAIL_MAX_POINTS) {
          state.trail = state.trail.slice(-TRAIL_MAX_POINTS);
        }

        // Draw
        drawTrail(ctx!, state.trail, state.color, now, REMOTE_TRAIL_OPACITY);
      }

      // --- Local trail ---
      localTrailRef.current = localTrailRef.current.filter(
        (p) => now - p.time < TRAIL_MAX_AGE
      );
      if (localTrailRef.current.length > TRAIL_MAX_POINTS) {
        localTrailRef.current = localTrailRef.current.slice(-TRAIL_MAX_POINTS);
      }
      drawTrail(
        ctx!,
        localTrailRef.current,
        playerColorRef.current,
        now,
        TRAIL_HEAD_OPACITY
      );

      // --- Burst particles ---
      const alive: BurstParticle[] = [];
      for (const p of burstParticlesRef.current) {
        p.life -= dt / BURST_LIFETIME;
        if (p.life <= 0) continue;

        p.vy += BURST_GRAVITY * dt;
        p.vx *= 1 - 3 * dt; // friction
        p.vy *= 1 - 3 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        const radius = p.size * Math.max(p.life, 0);
        if (radius < 0.3) continue;

        ctx!.beginPath();
        ctx!.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx!.globalAlpha = Math.max(p.life, 0) * 0.8;
        ctx!.fillStyle = p.color;
        ctx!.fill();
        ctx!.globalAlpha = 1;

        alive.push(p);
      }
      burstParticlesRef.current = alive;

      // --- FPS guard ---
      const frameDuration = performance.now() - now;
      if (frameDuration > 32) {
        slowFrameCount++;
        if (slowFrameCount > 5 && orbsRef.current.length > 2) {
          orbsRef.current = orbsRef.current.slice(0, 2);
        }
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
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0"
      style={{ width: "100vw", height: "100vh" }}
    />
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
