"use client";

import { useEffect, useRef } from "react";

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

interface Ripple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  opacity: number;
  color: string;
  startTime: number;
}

interface FluidBackgroundProps {
  /** Incoming ripples from other players (Convex) */
  remoteRipples?: Array<{
    id: string;
    x: number; // 0-1 normalized
    y: number; // 0-1 normalized
    color: string;
  }>;
  /** Called when the local player creates a ripple */
  onRipple?: (x: number, y: number) => void;
  /** The local player's color */
  playerColor?: string;
  /** Whether touch interaction is enabled */
  interactive?: boolean;
}

// --- Constants ---

const AMBIENT_COLORS = [
  "rgba(232, 85, 58, 0.04)", // primary
  "rgba(42, 157, 143, 0.04)", // accent
  "rgba(244, 162, 97, 0.03)", // secondary
  "rgba(124, 58, 237, 0.03)", // purple
];

const RIPPLE_DURATION = 2000;
const RIPPLE_MAX_RADIUS = 150;
const LOCAL_RIPPLE_OPACITY = 0.12;
const REMOTE_RIPPLE_OPACITY = 0.08;

// --- Component ---

export default function FluidBackground({
  remoteRipples = [],
  onRipple,
  playerColor = "#E8553A",
  interactive = true,
}: FluidBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const orbsRef = useRef<Orb[]>([]);
  const ripplesRef = useRef<Ripple[]>([]);
  const animFrameRef = useRef<number>(0);
  const lastRippleTime = useRef<number>(0);
  const seenRemoteIds = useRef<Set<string>>(new Set());
  const prefersReducedMotion = useRef(false);

  // Store latest props in refs for document-level listeners
  const playerColorRef = useRef(playerColor);
  const onRippleRef = useRef(onRipple);
  const interactiveRef = useRef(interactive);
  playerColorRef.current = playerColor;
  onRippleRef.current = onRipple;
  interactiveRef.current = interactive;

  // Initialize orbs + reduced motion detection
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

  // Process incoming remote ripples
  useEffect(() => {
    for (const rr of remoteRipples) {
      if (seenRemoteIds.current.has(rr.id)) continue;
      seenRemoteIds.current.add(rr.id);

      const canvas = canvasRef.current;
      if (!canvas) continue;

      ripplesRef.current.push({
        x: rr.x * window.innerWidth,
        y: rr.y * window.innerHeight,
        radius: 0,
        maxRadius: RIPPLE_MAX_RADIUS,
        opacity: REMOTE_RIPPLE_OPACITY,
        color: rr.color,
        startTime: performance.now(),
      });
    }

    // Trim seen IDs set to prevent memory growth
    if (seenRemoteIds.current.size > 200) {
      const arr = [...seenRemoteIds.current];
      seenRemoteIds.current = new Set(arr.slice(-100));
    }
  }, [remoteRipples]);

  // Document-level pointer listeners (avoids overlay blocking game UI)
  useEffect(() => {
    function createRipple(x: number, y: number) {
      if (!interactiveRef.current) return;

      const now = performance.now();
      if (now - lastRippleTime.current < 333) return;
      lastRippleTime.current = now;

      ripplesRef.current.push({
        x,
        y,
        radius: 0,
        maxRadius: RIPPLE_MAX_RADIUS,
        opacity: LOCAL_RIPPLE_OPACITY,
        color: playerColorRef.current,
        startTime: performance.now(),
      });

      // Cap ripple array
      if (ripplesRef.current.length > 30) {
        ripplesRef.current = ripplesRef.current.slice(-20);
      }

      onRippleRef.current?.(x / window.innerWidth, y / window.innerHeight);
    }

    function handlePointerDown(e: PointerEvent) {
      const el = e.target as HTMLElement;
      // Skip if interacting with game UI elements
      if (
        el.closest("button") ||
        el.closest("input") ||
        el.closest("svg") ||
        el.closest("a") ||
        el.closest("[data-no-ripple]")
      ) {
        return;
      }
      createRipple(e.clientX, e.clientY);
    }

    function handlePointerMove(e: PointerEvent) {
      if (e.buttons === 0) return;
      const el = e.target as HTMLElement;
      if (
        el.closest("button") ||
        el.closest("input") ||
        el.closest("svg") ||
        el.closest("a") ||
        el.closest("[data-no-ripple]")
      ) {
        return;
      }
      createRipple(e.clientX, e.clientY);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("pointermove", handlePointerMove);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("pointermove", handlePointerMove);
    };
  }, []);

  // Animation loop
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
      const frameStart = performance.now();
      const w = window.innerWidth;
      const h = window.innerHeight;

      ctx!.clearRect(0, 0, w, h);

      // --- Ambient orbs ---
      if (!prefersReducedMotion.current) {
        for (const orb of orbsRef.current) {
          const ox =
            w * (orb.x + 0.15 * Math.sin(now * orb.speedX + orb.phase));
          const oy =
            h * (orb.y + 0.1 * Math.cos(now * orb.speedY + orb.phase));
          const grad = ctx!.createRadialGradient(ox, oy, 0, ox, oy, orb.radius);
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

      // --- Ripples ---
      const alive: Ripple[] = [];
      for (const ripple of ripplesRef.current) {
        const elapsed = now - ripple.startTime;
        if (elapsed > RIPPLE_DURATION) continue;

        const progress = elapsed / RIPPLE_DURATION;

        if (prefersReducedMotion.current) {
          // Simple fade, no expansion
          ctx!.beginPath();
          ctx!.arc(ripple.x, ripple.y, ripple.maxRadius * 0.5, 0, Math.PI * 2);
          ctx!.globalAlpha = ripple.opacity * (1 - progress);
          ctx!.fillStyle = ripple.color;
          ctx!.fill();
          ctx!.globalAlpha = 1;
        } else {
          const easedProgress = 1 - Math.pow(1 - progress, 3);
          const currentRadius = ripple.maxRadius * easedProgress;
          const currentOpacity = ripple.opacity * (1 - progress);

          ctx!.beginPath();
          ctx!.arc(ripple.x, ripple.y, currentRadius, 0, Math.PI * 2);
          ctx!.strokeStyle = ripple.color;
          ctx!.lineWidth = 2;
          ctx!.globalAlpha = currentOpacity;
          ctx!.stroke();

          // Inner soft fill
          ctx!.globalAlpha = currentOpacity * 0.3;
          ctx!.fillStyle = ripple.color;
          ctx!.fill();
          ctx!.globalAlpha = 1;
        }

        alive.push(ripple);
      }
      ripplesRef.current = alive;

      // FPS guard — reduce orbs if struggling
      const frameDuration = performance.now() - frameStart;
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
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0"
      style={{ width: "100vw", height: "100vh" }}
    />
  );
}
