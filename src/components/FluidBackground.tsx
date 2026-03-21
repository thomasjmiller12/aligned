"use client";

import { useEffect, useRef, useCallback } from "react";

// --- Types ---

interface Tadpole {
  id: number;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  wanderAngle: number;
  tailX: Float32Array;
  tailY: Float32Array;
  tailHead: number;
  lastTailRecord: number;
  age: number;
  maxAge: number;
  alive: boolean;
  wigglePhase: number;
  wiggleFreq: number;
  maxSpeed: number;
  size: number;
  variant: TadpoleVariantId;
  arrival: number; // 0 = seeking cursor, 1 = schooling near cursor (continuous blend)
  nextKickTime: number; // age at which next random velocity kick fires (schooling mode)
  kickUntil: number; // age until which the current kick is "active" (suppresses spring)
}

// --- Variant System ---

type TadpoleVariantId = string;

interface TadpoleVariantDef {
  /** Spawn weight relative to others. Higher = more common. */
  weight: number;
  /** Size multiplier applied to base size on spawn. */
  sizeMul: number;
  /** Optional speed multiplier (default 1). */
  speedMul?: number;
  /** Draw function — receives pre-computed alpha, headRadius, speed. */
  draw: (
    ctx: CanvasRenderingContext2D,
    t: Tadpole,
    time: number,
    alpha: number,
    headRadius: number,
    speed: number,
    reducedMotion: boolean,
  ) => void;
}

const VARIANTS: Record<TadpoleVariantId, TadpoleVariantDef> = {};

function registerVariant(id: TadpoleVariantId, def: TadpoleVariantDef) {
  VARIANTS[id] = def;
}

/** Simple seeded PRNG (mulberry32). Returns 0-1. */
function seededRandom(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Pick a variant ID using weighted random selection.
 *  If a seed is provided, uses deterministic selection so all clients agree. */
function rollVariant(seed?: number): TadpoleVariantId {
  const entries = Object.entries(VARIANTS);
  const totalWeight = entries.reduce((sum, [, v]) => sum + v.weight, 0);
  const rand = seed != null ? seededRandom(seed) : Math.random();
  let roll = rand * totalWeight;
  for (const [id, v] of entries) {
    roll -= v.weight;
    if (roll <= 0) return id;
  }
  return entries[0][0]; // fallback
}

interface PlayerState {
  lastKnownX: number;
  lastKnownY: number;
  interpX: number;
  interpY: number;
  prevInterpX: number;
  prevInterpY: number;
  color: string;
  tadpoles: Tadpole[];
  lastSpawnTime: number;
  lastBurstAt?: number;
}

interface FluidBackgroundProps {
  remotePresence?: Array<{
    playerId: string;
    x: number;
    y: number;
    color: string;
    burstAt?: number;
    burstSeed?: number;
  }>;
  onLocalMove?: (x: number, y: number) => void;
  onLocalBurst?: (x: number, y: number, burstSeed: number) => void;
  playerColor?: string;
  interactive?: boolean;
  getExternalPointerPos?: () => { x: number; y: number } | null;
}

// --- Tadpole Constants ---

const MAX_TADPOLES_LOCAL = 12;
const MAX_TADPOLES_REMOTE = 6;
const MAX_TADPOLES_TOTAL = 60;
const TAIL_SEGMENTS = 8;
const TAIL_RECORD_INTERVAL = 0.025;
const SEEK_FORCE = 100;
const WANDER_FORCE = 15;
const SEPARATION_RADIUS = 24;
const SEPARATION_FORCE = 40;
const WIGGLE_BASE_AMPLITUDE = 1.5;
const WIGGLE_TIP_MULTIPLIER = 1.8;
const HEADING_MIN_SPEED = 3;
// Arrival system: per-tadpole continuous blend from seeking (0) to schooling (1)
const ARRIVE_NEAR = 25;  // fully schooling when this close to cursor
const ARRIVE_FAR = 70;   // fully seeking when this far from cursor
const ARRIVAL_ENGAGE_RATE = 2.5; // how fast arrival ramps up (~0.4s)
const ARRIVAL_DISENGAGE_RATE = 8.0; // how fast arrival drops (~0.12s, snappy exit)
const LOCAL_OPACITY = 0.6;
const REMOTE_OPACITY = 0.45;
const SPAWN_IN_DURATION = 0.5;
const FADE_START_FRACTION = 0.85;

// --- Lava-lamp blobs (unchanged) ---

const LAVA_BLOBS: Array<{
  color: [number, number, number];
  baseOpacity: number;
  baseRadius: number;
  x: number;
  y: number;
  freqX1: number;
  freqY1: number;
  freqX2: number;
  freqY2: number;
  ampX1: number;
  ampY1: number;
  ampX2: number;
  ampY2: number;
  pulseFreq: number;
  pulseAmp: number;
  opacityFreq: number;
  opacityAmp: number;
  phase: number;
}> = [
  {
    color: [232, 85, 58], baseOpacity: 0.28, baseRadius: 420,
    x: 0.25, y: 0.3,
    freqX1: 0.08, freqY1: 0.06, freqX2: 0.03, freqY2: 0.05,
    ampX1: 0.18, ampY1: 0.15, ampX2: 0.1, ampY2: 0.08,
    pulseFreq: 0.15, pulseAmp: 0.3,
    opacityFreq: 0.1, opacityAmp: 0.4, phase: 0,
  },
  {
    color: [42, 157, 143], baseOpacity: 0.25, baseRadius: 400,
    x: 0.7, y: 0.6,
    freqX1: 0.07, freqY1: 0.09, freqX2: 0.04, freqY2: 0.02,
    ampX1: 0.2, ampY1: 0.18, ampX2: 0.08, ampY2: 0.1,
    pulseFreq: 0.12, pulseAmp: 0.35,
    opacityFreq: 0.08, opacityAmp: 0.45, phase: 1.2,
  },
  {
    color: [244, 162, 97], baseOpacity: 0.22, baseRadius: 350,
    x: 0.5, y: 0.2,
    freqX1: 0.1, freqY1: 0.07, freqX2: 0.05, freqY2: 0.04,
    ampX1: 0.22, ampY1: 0.18, ampX2: 0.12, ampY2: 0.08,
    pulseFreq: 0.18, pulseAmp: 0.25,
    opacityFreq: 0.13, opacityAmp: 0.35, phase: 2.5,
  },
  {
    color: [220, 100, 50], baseOpacity: 0.2, baseRadius: 280,
    x: 0.15, y: 0.7,
    freqX1: 0.12, freqY1: 0.1, freqX2: 0.06, freqY2: 0.08,
    ampX1: 0.25, ampY1: 0.2, ampX2: 0.14, ampY2: 0.1,
    pulseFreq: 0.2, pulseAmp: 0.4,
    opacityFreq: 0.15, opacityAmp: 0.5, phase: 3.8,
  },
  {
    color: [30, 140, 130], baseOpacity: 0.2, baseRadius: 330,
    x: 0.8, y: 0.25,
    freqX1: 0.06, freqY1: 0.11, freqX2: 0.03, freqY2: 0.07,
    ampX1: 0.15, ampY1: 0.22, ampX2: 0.1, ampY2: 0.14,
    pulseFreq: 0.14, pulseAmp: 0.32,
    opacityFreq: 0.11, opacityAmp: 0.42, phase: 5.0,
  },
  {
    color: [255, 200, 160], baseOpacity: 0.18, baseRadius: 500,
    x: 0.4, y: 0.8,
    freqX1: 0.05, freqY1: 0.04, freqX2: 0.02, freqY2: 0.03,
    ampX1: 0.18, ampY1: 0.12, ampX2: 0.08, ampY2: 0.06,
    pulseFreq: 0.08, pulseAmp: 0.25,
    opacityFreq: 0.06, opacityAmp: 0.35, phase: 0.7,
  },
  {
    color: [50, 180, 165], baseOpacity: 0.18, baseRadius: 250,
    x: 0.6, y: 0.45,
    freqX1: 0.14, freqY1: 0.09, freqX2: 0.07, freqY2: 0.05,
    ampX1: 0.22, ampY1: 0.18, ampX2: 0.12, ampY2: 0.1,
    pulseFreq: 0.22, pulseAmp: 0.35,
    opacityFreq: 0.16, opacityAmp: 0.45, phase: 4.2,
  },
  {
    color: [200, 60, 40], baseOpacity: 0.14, baseRadius: 550,
    x: 0.35, y: 0.5,
    freqX1: 0.04, freqY1: 0.03, freqX2: 0.02, freqY2: 0.015,
    ampX1: 0.12, ampY1: 0.1, ampX2: 0.06, ampY2: 0.05,
    pulseFreq: 0.06, pulseAmp: 0.2,
    opacityFreq: 0.05, opacityAmp: 0.3, phase: 1.8,
  },
];

const LERP_FACTOR = 0.15;
const PRESENCE_SEND_INTERVAL = 150;

// --- Tadpole Pool ---

let nextTadpoleId = 0;
const tadpolePool: Tadpole[] = [];
let totalAlive = 0;

function createTadpole(): Tadpole {
  return {
    id: 0,
    color: "",
    x: 0, y: 0, vx: 0, vy: 0,
    heading: 0,
    wanderAngle: Math.random() * Math.PI * 2,
    tailX: new Float32Array(TAIL_SEGMENTS),
    tailY: new Float32Array(TAIL_SEGMENTS),
    tailHead: 0,
    lastTailRecord: 0,
    age: 0,
    maxAge: 3,
    alive: false,
    wigglePhase: 0,
    wiggleFreq: 5,
    maxSpeed: 150,
    size: 5,
    variant: "normal" as TadpoleVariantId,
    arrival: 0,
    nextKickTime: 0,
    kickUntil: 0,
  };
}

// Box-Muller transform — returns a gaussian sample with given mean and stddev
function gaussianRandom(mean: number, stddev: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stddev;
}

function spawnTadpole(
  cursorX: number,
  cursorY: number,
  color: string,
  variantSeed?: number
): Tadpole | null {
  if (totalAlive >= MAX_TADPOLES_TOTAL) return null;

  let t: Tadpole;
  if (tadpolePool.length > 0) {
    t = tadpolePool.pop()!;
  } else {
    t = createTadpole();
  }

  const angle = Math.random() * Math.PI * 2;
  const dist = 5 + Math.random() * 10;

  t.id = nextTadpoleId++;
  t.color = color;
  t.x = cursorX + Math.cos(angle) * dist;
  t.y = cursorY + Math.sin(angle) * dist;
  t.vx = Math.cos(angle) * 15;
  t.vy = Math.sin(angle) * 15;
  t.heading = angle;
  t.wanderAngle = Math.random() * Math.PI * 2;
  t.age = 0;
  t.maxAge = 50 + Math.random() * 20;
  t.alive = true;
  t.wigglePhase = Math.random() * Math.PI * 2;
  t.wiggleFreq = 4 + Math.random() * 2;
  t.variant = rollVariant(variantSeed);
  const variantDef = VARIANTS[t.variant];
  t.maxSpeed = (54 + Math.random() * 34) * (variantDef?.speedMul ?? 1);
  const baseSize = Math.max(1.5, Math.min(3.5, gaussianRandom(2.5, 0.4)));
  t.size = baseSize * (variantDef?.sizeMul ?? 1);
  t.nextKickTime = 0.5 + Math.random() * 1.5; // first kick after 0.5-2s
  t.tailHead = 0;
  t.lastTailRecord = 0;

  // Fill tail with spawn position
  for (let i = 0; i < TAIL_SEGMENTS; i++) {
    t.tailX[i] = t.x;
    t.tailY[i] = t.y;
  }

  totalAlive++;
  return t;
}

function killTadpole(t: Tadpole): void {
  t.alive = false;
  totalAlive = Math.max(0, totalAlive - 1);
  tadpolePool.push(t);
}

// --- Tadpole Physics ---

function updateTadpole(
  t: Tadpole,
  cursorX: number,
  cursorY: number,
  siblings: Tadpole[],
  dt: number,
  time: number,
  reducedMotion: boolean
): void {
  t.age += dt;
  if (t.age >= t.maxAge) {
    killTadpole(t);
    return;
  }

  // Cursor-relative vector
  const dx = cursorX - t.x;
  const dy = cursorY - t.y;
  const distToCursor = Math.sqrt(dx * dx + dy * dy);

  // --- Per-tadpole arrival factor (0 = seeking, 1 = schooling) ---
  // Based purely on proximity: close to cursor → school, far → seek.
  // When cursor moves, tadpoles are suddenly far → arrival drops naturally.
  const targetArrival = Math.max(0, Math.min(1,
    1 - (distToCursor - ARRIVE_NEAR) / (ARRIVE_FAR - ARRIVE_NEAR)));
  const arrRate = targetArrival > t.arrival ? ARRIVAL_ENGAGE_RATE : ARRIVAL_DISENGAGE_RATE;
  t.arrival += (targetArrival - t.arrival) * Math.min(1, arrRate * dt);
  const a = t.arrival; // shorthand

  let seekFx = 0, seekFy = 0;
  if (distToCursor > 3) {
    const nx = dx / distToCursor;
    const ny = dy / distToCursor;

    // === Seeking force (chase the cursor) ===
    let sMul = 1.0;
    if (distToCursor > 100) sMul *= 1.5;
    const desiredVx = nx * t.maxSpeed;
    const desiredVy = ny * t.maxSpeed;
    let activeFx = (desiredVx - t.vx) * sMul;
    let activeFy = (desiredVy - t.vy) * sMul;
    const seekMag = Math.sqrt(activeFx * activeFx + activeFy * activeFy);
    const maxSeek = SEEK_FORCE * dt;
    if (seekMag > maxSeek) {
      activeFx = (activeFx / seekMag) * maxSeek;
      activeFy = (activeFy / seekMag) * maxSeek;
    }

    // === Schooling force (lazy drift near cursor) ===
    // Spring pulls them back; suppress spring during kicks so they coast further.
    const kicking = t.age < t.kickUntil;
    const springStrength = kicking ? 0.1 : 0.5;
    const schoolFx = dx * springStrength;
    const schoolFy = dy * springStrength;

    // Blend based on arrival
    seekFx = activeFx * (1 - a) + schoolFx * a;
    seekFy = activeFy * (1 - a) + schoolFy * a;
  }

  // --- Random velocity kicks when schooling ---
  // Periodic bursts with suppressed spring let them coast and explore.
  let kickFx = 0, kickFy = 0;
  if (a > 0.5 && t.age >= t.nextKickTime && !reducedMotion) {
    const kickAngle = Math.random() * Math.PI * 2;
    const kickStrength = 18 + Math.random() * 22; // 18-40 px/s impulse
    kickFx = Math.cos(kickAngle) * kickStrength;
    kickFy = Math.sin(kickAngle) * kickStrength;
    t.kickUntil = t.age + 0.4 + Math.random() * 0.4; // coast for 0.4-0.8s
    t.nextKickTime = t.age + 1.5 + Math.random() * 2.5; // next kick in 1.5-4s
  }

  // Wander (light background drift, reduced when schooling since kicks handle it)
  let wanderMul = reducedMotion ? 0 : (0.5 - a * 0.3);
  const wanderTurnRate = 1.5;
  t.wanderAngle += (Math.random() - 0.5) * wanderTurnRate * dt;
  const wanderFx = Math.cos(t.wanderAngle) * WANDER_FORCE * wanderMul * dt;
  const wanderFy = Math.sin(t.wanderAngle) * WANDER_FORCE * wanderMul * dt;

  // Separation — stronger when schooling to prevent clumping
  let sepFx = 0, sepFy = 0;
  for (const other of siblings) {
    if (!other.alive || other.id === t.id) continue;
    const sdx = t.x - other.x;
    const sdy = t.y - other.y;
    const sDist = Math.sqrt(sdx * sdx + sdy * sdy);
    if (sDist < SEPARATION_RADIUS && sDist > 0.1) {
      const sepMul = 1.0 + a * 1.5;
      const strength = (1 - sDist / SEPARATION_RADIUS) * SEPARATION_FORCE * sepMul * dt;
      sepFx += (sdx / sDist) * strength;
      sepFy += (sdy / sDist) * strength;
    }
  }

  // Integrate velocity
  t.vx += seekFx + wanderFx + sepFx + kickFx;
  t.vy += seekFy + wanderFy + sepFy + kickFy;

  // Speed cap blends smoothly: full speed seeking → 25% when schooling
  const speedCap = t.maxSpeed * (1 - a * 0.75);
  const speed = Math.sqrt(t.vx * t.vx + t.vy * t.vy);
  if (speed > speedCap) {
    t.vx = (t.vx / speed) * speedCap;
    t.vy = (t.vy / speed) * speedCap;
  }

  // Constant drag — no parameter switching, no jarring speed-up
  const drag = 1 - 2.0 * dt;
  t.vx *= drag;
  t.vy *= drag;

  // Update position
  t.x += t.vx * dt;
  t.y += t.vy * dt;

  // Update heading (smooth, skip when nearly stationary)
  if (speed > HEADING_MIN_SPEED) {
    const targetHeading = Math.atan2(t.vy, t.vx);
    const rate = Math.min(1, speed * 0.02 * dt * 60);
    t.heading = lerpAngle(t.heading, targetHeading, rate);
  }

  // Record tail position
  if (time - t.lastTailRecord >= TAIL_RECORD_INTERVAL) {
    t.lastTailRecord = time;
    t.tailHead = (t.tailHead + 1) % TAIL_SEGMENTS;
    t.tailX[t.tailHead] = t.x;
    t.tailY[t.tailHead] = t.y;
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

// --- Tadpole Drawing ---

function getLifecycleAlpha(t: Tadpole): number {
  // Spawn-in
  if (t.age < SPAWN_IN_DURATION) {
    const p = t.age / SPAWN_IN_DURATION;
    return 0.1 + 0.9 * (1 - (1 - p) * (1 - p)); // ease-out
  }
  // Fade-out
  const fadeStart = t.maxAge * FADE_START_FRACTION;
  if (t.age > fadeStart) {
    return 1 - (t.age - fadeStart) / (t.maxAge - fadeStart);
  }
  return 1;
}

function getSizeMul(t: Tadpole): number {
  // Spawn-in scale
  if (t.age < SPAWN_IN_DURATION) {
    const p = t.age / SPAWN_IN_DURATION;
    return 0.1 + 0.9 * (1 - (1 - p) * (1 - p));
  }
  // Shrink during fade-out
  const fadeStart = t.maxAge * FADE_START_FRACTION;
  if (t.age > fadeStart) {
    const p = (t.age - fadeStart) / (t.maxAge - fadeStart);
    return 1 - p * 0.4;
  }
  return 1;
}

function drawTadpole(
  ctx: CanvasRenderingContext2D,
  t: Tadpole,
  time: number,
  opacityMul: number,
  reducedMotion: boolean
): void {
  if (!t.alive) return;

  const alpha = getLifecycleAlpha(t) * opacityMul;
  if (alpha < 0.01) return;

  const sizeMul = getSizeMul(t);
  const headRadius = t.size * sizeMul;
  if (headRadius < 0.5) return;

  const speed = Math.sqrt(t.vx * t.vx + t.vy * t.vy);
  const variantDef = VARIANTS[t.variant];
  if (variantDef) {
    variantDef.draw(ctx, t, time, alpha, headRadius, speed, reducedMotion);
  }
}

// --- Shared drawing helpers for variants ---

function drawEyes(
  ctx: CanvasRenderingContext2D,
  t: Tadpole,
  alpha: number,
  headRadius: number,
) {
  const eyeOffset = headRadius * 0.45;
  const eyeForward = headRadius * 0.35;
  const eyeSize = headRadius * 0.38;
  const ex = t.x + Math.cos(t.heading) * eyeForward;
  const ey = t.y + Math.sin(t.heading) * eyeForward;
  const perpX = -Math.sin(t.heading);
  const perpY = Math.cos(t.heading);

  ctx.globalAlpha = alpha * 0.9;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(ex + perpX * eyeOffset, ey + perpY * eyeOffset, eyeSize, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(ex - perpX * eyeOffset, ey - perpY * eyeOffset, eyeSize, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#222";
  const pupilSize = eyeSize * 0.55;
  const pupilFwd = eyeSize * 0.2;
  ctx.beginPath();
  ctx.arc(
    ex + perpX * eyeOffset + Math.cos(t.heading) * pupilFwd,
    ey + perpY * eyeOffset + Math.sin(t.heading) * pupilFwd,
    pupilSize, 0, Math.PI * 2
  );
  ctx.fill();
  ctx.beginPath();
  ctx.arc(
    ex - perpX * eyeOffset + Math.cos(t.heading) * pupilFwd,
    ey - perpY * eyeOffset + Math.sin(t.heading) * pupilFwd,
    pupilSize, 0, Math.PI * 2
  );
  ctx.fill();
  ctx.globalAlpha = 1;
}

// ============================================================
// VARIANT DEFINITIONS — add new ones with registerVariant()
// ============================================================

// Normal: simple circle head + tapered tail (most common)
registerVariant("normal", {
  weight: 148,
  sizeMul: 1,
  draw(ctx, t, time, alpha, headRadius, speed, reducedMotion) {
    drawTadpoleTail(ctx, t, time, alpha, headRadius, speed, reducedMotion);
    ctx.beginPath();
    ctx.arc(t.x, t.y, headRadius, 0, Math.PI * 2);
    ctx.fillStyle = t.color;
    ctx.globalAlpha = alpha;
    ctx.fill();
    ctx.globalAlpha = 1;
  },
});

// Big: 3x size normal with eyes and a thicker, more prominent tail (~1 in 50)
registerVariant("big", {
  weight: 3,
  sizeMul: 3,
  speedMul: 0.7,
  draw(ctx, t, time, alpha, headRadius, speed, reducedMotion) {
    // Pass inflated headRadius so the tail is wider and more visible
    drawTadpoleTail(ctx, t, time, alpha, headRadius * 1.4, speed, reducedMotion);
    ctx.beginPath();
    ctx.arc(t.x, t.y, headRadius, 0, Math.PI * 2);
    ctx.fillStyle = t.color;
    ctx.globalAlpha = alpha;
    ctx.fill();
    drawEyes(ctx, t, alpha, headRadius);
  },
});

// Ghost (jellyfish): dome head + 3 wavy tendrils (~1 in 100)
registerVariant("ghost", {
  weight: 1.5,
  sizeMul: 3,
  speedMul: 0.5,
  draw(ctx, t, time, alpha, headRadius, _speed, _reducedMotion) {
    // 3 wavy tendrils
    for (let ti = -1; ti <= 1; ti++) {
      const offsetAngle = t.heading + (ti * 0.3);
      const startX = t.x - Math.cos(t.heading) * headRadius * 0.5 +
        Math.cos(offsetAngle + Math.PI / 2) * ti * headRadius * 0.4;
      const startY = t.y - Math.sin(t.heading) * headRadius * 0.5 +
        Math.sin(offsetAngle + Math.PI / 2) * ti * headRadius * 0.4;

      const tendrilPts: Array<{ x: number; y: number; w: number }> = [];
      for (let i = 0; i < TAIL_SEGMENTS; i++) {
        const idx = ((t.tailHead - i) % TAIL_SEGMENTS + TAIL_SEGMENTS) % TAIL_SEGMENTS;
        const frac = i / (TAIL_SEGMENTS - 1);
        const wiggle = Math.sin(i * 6 + time * 6 + ti * 1.5) * (0.3 + frac * 1.5) * 1.2;
        const localAngle = t.heading + Math.PI;
        const perpX = -Math.sin(localAngle);
        const perpY = Math.cos(localAngle);
        tendrilPts.push({
          x: t.tailX[idx] + (startX - t.x) + perpX * wiggle,
          y: t.tailY[idx] + (startY - t.y) + perpY * wiggle,
          w: Math.max(headRadius * 0.2 * (1 - frac * 0.9), 0.3),
        });
      }
      if (tendrilPts.length < 2) continue;

      ctx.beginPath();
      const p0 = tendrilPts[0];
      const a0 = Math.atan2(tendrilPts[1].y - p0.y, tendrilPts[1].x - p0.x);
      ctx.moveTo(p0.x + Math.sin(a0) * p0.w, p0.y - Math.cos(a0) * p0.w);
      for (let i = 1; i < tendrilPts.length; i++) {
        const curr = tendrilPts[i];
        const prev = tendrilPts[i - 1];
        const angle = Math.atan2(curr.y - prev.y, curr.x - prev.x);
        ctx.lineTo(curr.x + Math.sin(angle) * curr.w, curr.y - Math.cos(angle) * curr.w);
      }
      const tip = tendrilPts[tendrilPts.length - 1];
      ctx.lineTo(tip.x, tip.y);
      for (let i = tendrilPts.length - 1; i >= 1; i--) {
        const curr = tendrilPts[i];
        const prev = tendrilPts[i - 1];
        const angle = Math.atan2(curr.y - prev.y, curr.x - prev.x);
        ctx.lineTo(curr.x - Math.sin(angle) * curr.w, curr.y + Math.cos(angle) * curr.w);
      }
      const aEnd = Math.atan2(tendrilPts[1].y - p0.y, tendrilPts[1].x - p0.x);
      ctx.lineTo(p0.x - Math.sin(aEnd) * p0.w, p0.y + Math.cos(aEnd) * p0.w);
      ctx.closePath();
      ctx.fillStyle = t.color;
      ctx.globalAlpha = alpha * 0.44;
      ctx.fill();
    }

    // Dome head
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate(t.heading);
    ctx.beginPath();
    ctx.arc(0, 0, headRadius, -Math.PI / 2, Math.PI / 2);
    ctx.bezierCurveTo(
      -headRadius * 0.3, headRadius,
      -headRadius * 0.3, -headRadius,
      0, -headRadius
    );
    ctx.fillStyle = t.color;
    ctx.globalAlpha = alpha;
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  },
});

function drawTadpoleTail(
  ctx: CanvasRenderingContext2D,
  t: Tadpole,
  time: number,
  alpha: number,
  headRadius: number,
  speed: number,
  reducedMotion: boolean
): void {
  // Compute wiggled tail segment positions + widths
  const wiggleSpeed = reducedMotion ? 0 : 8 + speed * 0.03;
  const points: Array<{ x: number; y: number; w: number }> = [];

  for (let i = 0; i < TAIL_SEGMENTS; i++) {
    const idx = ((t.tailHead - i) % TAIL_SEGMENTS + TAIL_SEGMENTS) % TAIL_SEGMENTS;
    const sx = t.tailX[idx];
    const sy = t.tailY[idx];

    // Local direction from this segment to the next (toward head)
    let localAngle = t.heading;
    if (i < TAIL_SEGMENTS - 1) {
      const nextIdx = ((t.tailHead - i - 1) % TAIL_SEGMENTS + TAIL_SEGMENTS) % TAIL_SEGMENTS;
      const ddx = t.tailX[nextIdx] - sx;
      const ddy = t.tailY[nextIdx] - sy;
      if (ddx * ddx + ddy * ddy > 0.1) {
        localAngle = Math.atan2(ddy, ddx);
      }
    }

    // Perpendicular
    const perpX = -Math.sin(localAngle);
    const perpY = Math.cos(localAngle);

    // Wiggle offset (grows toward tip)
    const frac = i / (TAIL_SEGMENTS - 1);
    const wiggleAmp = reducedMotion ? 0 : WIGGLE_BASE_AMPLITUDE * (0.3 + frac * WIGGLE_TIP_MULTIPLIER);
    const offset = Math.sin(i * t.wiggleFreq + time * wiggleSpeed + t.wigglePhase) * wiggleAmp;

    // Width tapers from head to tip
    const width = headRadius * 0.66 * (1 - frac * 0.95);

    points.push({
      x: sx + perpX * offset,
      y: sy + perpY * offset,
      w: Math.max(width, 0.3),
    });
  }

  if (points.length < 2) return;

  // Draw filled tapered tail shape
  ctx.beginPath();

  // Left edge (head to tip)
  const p0 = points[0];
  const a0 = Math.atan2(points[1].y - p0.y, points[1].x - p0.x);
  ctx.moveTo(
    p0.x + Math.sin(a0) * p0.w,
    p0.y - Math.cos(a0) * p0.w
  );

  for (let i = 1; i < points.length; i++) {
    const curr = points[i];
    const prev = points[i - 1];
    const angle = Math.atan2(curr.y - prev.y, curr.x - prev.x);
    ctx.lineTo(
      curr.x + Math.sin(angle) * curr.w,
      curr.y - Math.cos(angle) * curr.w
    );
  }

  // Tip
  const tip = points[points.length - 1];
  ctx.lineTo(tip.x, tip.y);

  // Right edge (tip back to head)
  for (let i = points.length - 1; i >= 1; i--) {
    const curr = points[i];
    const prev = points[i - 1];
    const angle = Math.atan2(curr.y - prev.y, curr.x - prev.x);
    ctx.lineTo(
      curr.x - Math.sin(angle) * curr.w,
      curr.y + Math.cos(angle) * curr.w
    );
  }

  const aEnd = Math.atan2(points[1].y - p0.y, points[1].x - p0.x);
  ctx.lineTo(
    p0.x - Math.sin(aEnd) * p0.w,
    p0.y + Math.cos(aEnd) * p0.w
  );

  ctx.closePath();
  ctx.fillStyle = t.color;
  ctx.globalAlpha = alpha * 0.44;
  ctx.fill();
  ctx.globalAlpha = 1;
}

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
  const fxCanvasRef = useRef<HTMLCanvasElement>(null);
  const localTadpolesRef = useRef<Tadpole[]>([]);
  const localCursorRef = useRef<{ x: number; y: number }>({
    x: -1000, y: -1000,
  });
  const playersRef = useRef<Map<string, PlayerState>>(new Map());
  const animFrameRef = useRef<number>(0);
  const lastSendTime = useRef<number>(0);
  const lastFrameTime = useRef<number>(0);
  const prefersReducedMotion = useRef(false);

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

  const updateLocalCursor = useCallback((x: number, y: number) => {
    const cursor = localCursorRef.current;
    if (Math.hypot(x - cursor.x, y - cursor.y) < 2) return;
    cursor.x = x;
    cursor.y = y;
  }, []);

  const throttleSendPresence = useCallback((x: number, y: number) => {
    const now = performance.now();
    if (now - lastSendTime.current < PRESENCE_SEND_INTERVAL) return;
    lastSendTime.current = now;
    onLocalMoveRef.current?.(x / window.innerWidth, y / window.innerHeight);
  }, []);

  const handleTap = useCallback((x: number, y: number): number => {
    const maxLocal = prefersReducedMotion.current ? 1 : MAX_TADPOLES_LOCAL;
    // Clean dead refs first
    localTadpolesRef.current = localTadpolesRef.current.filter((tp) => tp.alive);
    const aliveCount = localTadpolesRef.current.length;

    // Recycle oldest if at max so clicking always feels responsive
    if (aliveCount >= maxLocal) {
      let oldestIdx = -1;
      let oldestAge = -1;
      for (let i = 0; i < localTadpolesRef.current.length; i++) {
        const tp = localTadpolesRef.current[i];
        if (tp.alive && tp.age > oldestAge) {
          oldestAge = tp.age;
          oldestIdx = i;
        }
      }
      if (oldestIdx >= 0) {
        killTadpole(localTadpolesRef.current[oldestIdx]);
        localTadpolesRef.current.splice(oldestIdx, 1);
      }
    }

    // Generate a seed so all clients pick the same variant for this burst
    const burstSeed = Math.floor(Math.random() * 2147483647);
    const t = spawnTadpole(x, y, playerColorRef.current, burstSeed);
    if (t) {
      localTadpolesRef.current.push(t);
    }
    return burstSeed;
  }, []);

  // --- Reduced motion ---

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
          prevInterpX: rp.x * w,
          prevInterpY: rp.y * h,
          color: rp.color,
          tadpoles: [],
          lastSpawnTime: 0,
        };
        players.set(rp.playerId, state);
      } else {
        state.lastKnownX = rp.x * w;
        state.lastKnownY = rp.y * h;
        state.color = rp.color;
      }

      // Detect new burst — spawn 1 tadpole for remote player on their tap
      if (rp.burstAt && rp.burstAt !== state.lastBurstAt) {
        state.lastBurstAt = rp.burstAt;
        state.tadpoles = state.tadpoles.filter((tp) => tp.alive);
        if (state.tadpoles.length >= MAX_TADPOLES_REMOTE) {
          let oldestIdx = -1;
          let oldestAge = -1;
          for (let i = 0; i < state.tadpoles.length; i++) {
            const tp = state.tadpoles[i];
            if (tp.alive && tp.age > oldestAge) {
              oldestAge = tp.age;
              oldestIdx = i;
            }
          }
          if (oldestIdx >= 0) {
            killTadpole(state.tadpoles[oldestIdx]);
            state.tadpoles.splice(oldestIdx, 1);
          }
        }
        const t = spawnTadpole(rp.x * w, rp.y * h, rp.color, rp.burstSeed);
        if (t) state.tadpoles.push(t);
      }
    }

    // Remove players who left (clean up their tadpoles)
    for (const [id, state] of players) {
      if (!activeIds.has(id)) {
        for (const t of state.tadpoles) {
          if (t.alive) killTadpole(t);
        }
        players.delete(id);
      }
    }
  }, [remotePresence]);

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

    function handleTouchMove(e: TouchEvent) {
      if (!interactiveRef.current) return;
      if (isUIElement(e.target as Element)) return;
      e.preventDefault();
    }

    function handlePointerDown(e: PointerEvent) {
      if (!interactiveRef.current || shouldSkip(e)) return;
      updateLocalCursor(e.clientX, e.clientY);
      const burstSeed = handleTap(e.clientX, e.clientY);
      onLocalBurstRef.current?.(
        e.clientX / window.innerWidth,
        e.clientY / window.innerHeight,
        burstSeed
      );
      throttleSendPresence(e.clientX, e.clientY);
    }

    function handlePointerMove(e: PointerEvent) {
      if (!interactiveRef.current || shouldSkip(e)) return;
      updateLocalCursor(e.clientX, e.clientY);
      throttleSendPresence(e.clientX, e.clientY);
    }

    function handleDragStart(e: DragEvent) {
      e.preventDefault();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("dragstart", handleDragStart);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("dragstart", handleDragStart);
    };
  }, [updateLocalCursor, throttleSendPresence, handleTap]);

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
      lavaCanvas!.width = Math.round(w * dpr * 0.5);
      lavaCanvas!.height = Math.round(h * dpr * 0.5);
      lavaCtx!.setTransform(dpr * 0.5, 0, 0, dpr * 0.5, 0, 0);
      fxCanvas!.width = w * dpr;
      fxCanvas!.height = h * dpr;
      fxCtx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    resize();
    window.addEventListener("resize", resize);

    let slowFrameCount = 0;

    function draw(now: number) {
      const dt = lastFrameTime.current
        ? Math.min((now - lastFrameTime.current) / 1000, 0.05)
        : 0.016;
      lastFrameTime.current = now;

      const w = window.innerWidth;
      const h = window.innerHeight;
      const time = now * 0.001;
      const reduced = prefersReducedMotion.current;
      lavaCtx!.clearRect(0, 0, w, h);
      fxCtx!.clearRect(0, 0, w, h);

      // --- External pointer (dial drag) ---
      const extPos = getExternalPointerPosRef.current?.();
      if (extPos) {
        updateLocalCursor(extPos.x, extPos.y);
        const sendNow = performance.now();
        if (sendNow - lastSendTime.current >= PRESENCE_SEND_INTERVAL) {
          lastSendTime.current = sendNow;
          onLocalMoveRef.current?.(extPos.x / w, extPos.y / h);
        }
      }

      // --- Lava-lamp blobs (drawn to blurred canvas) ---
      if (!reduced) {
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
          lavaCtx!.fillRect(ox - radius, oy - radius, radius * 2, radius * 2);
        }
      }

      // --- Remote player tadpoles (spawned only on burst/tap, not movement) ---
      for (const [, state] of playersRef.current) {
        state.prevInterpX = state.interpX;
        state.prevInterpY = state.interpY;
        state.interpX += (state.lastKnownX - state.interpX) * LERP_FACTOR;
        state.interpY += (state.lastKnownY - state.interpY) * LERP_FACTOR;

        // Remove dead
        state.tadpoles = state.tadpoles.filter((t) => t.alive);

        // Update physics
        for (const t of state.tadpoles) {
          if (!t.alive) continue;
          updateTadpole(t, state.interpX, state.interpY, state.tadpoles, dt, time, reduced);
        }
        state.tadpoles = state.tadpoles.filter((t) => t.alive);

        // Draw
        for (const t of state.tadpoles) {
          drawTadpole(fxCtx!, t, time, REMOTE_OPACITY, reduced);
        }
      }

      // --- Local tadpoles (spawned only on tap/click, not on movement) ---
      const cursor = localCursorRef.current;

      if (cursor.x > -500) {
        // Remove dead
        localTadpolesRef.current = localTadpolesRef.current.filter((t) => t.alive);

        // Update physics
        for (const t of localTadpolesRef.current) {
          if (!t.alive) continue;
          updateTadpole(t, cursor.x, cursor.y, localTadpolesRef.current, dt, time, reduced);
        }
        // Clean up any that just died
        localTadpolesRef.current = localTadpolesRef.current.filter((t) => t.alive);

        // Draw
        for (const t of localTadpolesRef.current) {
          drawTadpole(fxCtx!, t, time, LOCAL_OPACITY, reduced);
        }
      }

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
      <canvas
        ref={canvasRef}
        className="pointer-events-none fixed inset-0 z-0"
        style={{ width: "100vw", height: "100vh", filter: "blur(80px)" }}
      />
      <canvas
        ref={fxCanvasRef}
        className="pointer-events-none fixed inset-0 z-0"
        style={{ width: "100vw", height: "100vh" }}
      />
    </>
  );
}
