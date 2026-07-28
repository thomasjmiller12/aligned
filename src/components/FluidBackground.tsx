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
  variantTable = null;
}

/** Flattened weight table, rebuilt only when a variant is registered. */
let variantTable: {
  ids: TadpoleVariantId[];
  weights: number[];
  total: number;
} | null = null;

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
  if (!variantTable) {
    // Insertion order is registration order, which is identical on every client,
    // so seeded rolls stay in agreement across players.
    const entries = Object.entries(VARIANTS);
    variantTable = {
      ids: entries.map(([id]) => id),
      weights: entries.map(([, v]) => v.weight),
      total: entries.reduce((sum, [, v]) => sum + v.weight, 0),
    };
  }
  const { ids, weights, total } = variantTable;
  const rand = seed != null ? seededRandom(seed) : Math.random();
  let roll = rand * total;
  for (let i = 0; i < ids.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return ids[i];
  }
  return ids[0]; // fallback
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

// Ray (manta): gliding diamond body with two translucent wings that beat (~1 in 64)
registerVariant("ray", {
  weight: 2.5,
  sizeMul: 2.8,
  speedMul: 0.55,
  draw(ctx, t, time, alpha, headRadius, _speed, reducedMotion) {
    // Wing beat sweeps the tips out and back — reads as flapping from above
    const beat = reducedMotion ? 0 : Math.sin(time * 2.6 + t.wigglePhase);
    const len = headRadius * 1.5; // nose to tail base
    const span = headRadius * (1.75 + beat * 0.4); // half wingspan

    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate(t.heading);

    // Whip tail, trailing opposite the beat
    ctx.beginPath();
    ctx.moveTo(-len * 0.75, 0);
    ctx.quadraticCurveTo(-len * 1.7, -beat * headRadius * 0.3, -len * 2.5, -beat * headRadius * 0.6);
    ctx.strokeStyle = t.color;
    ctx.lineWidth = Math.max(0.6, headRadius * 0.13);
    ctx.lineCap = "round";
    ctx.globalAlpha = alpha * 0.65;
    ctx.stroke();

    // Wings — mirrored bezier sweeps from nose to tip to tail base
    ctx.globalAlpha = alpha * 0.5;
    ctx.fillStyle = t.color;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(len, 0);
      ctx.bezierCurveTo(
        len * 0.45, side * span * 0.7,
        -len * 0.05, side * span,
        -len * 0.5, side * span * 0.7
      );
      ctx.bezierCurveTo(
        -len * 0.5, side * span * 0.3,
        -len * 0.7, side * span * 0.1,
        -len * 0.75, 0
      );
      ctx.closePath();
      ctx.fill();
    }

    // Opaque central ridge so the body reads through the wing overlap
    ctx.beginPath();
    ctx.ellipse(len * 0.05, 0, len * 0.62, headRadius * 0.4, 0, 0, Math.PI * 2);
    ctx.globalAlpha = alpha;
    ctx.fill();

    ctx.restore();
    ctx.globalAlpha = 1;
  },
});

// Angler: rare deep-sea silhouette with a bobbing lure glowing in the player's color (~1 in 265)
registerVariant("angler", {
  weight: 0.6,
  sizeMul: 2.4,
  speedMul: 0.5,
  draw(ctx, t, time, alpha, headRadius, speed, reducedMotion) {
    drawTadpoleTail(ctx, t, time, alpha * 0.8, headRadius * 0.85, speed, reducedMotion);

    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate(t.heading);
    ctx.globalAlpha = alpha;

    // Body — near-black, so the lure carries the player's identity instead
    ctx.beginPath();
    ctx.ellipse(0, 0, headRadius * 1.15, headRadius * 0.95, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#1A1626";
    ctx.fill();

    // Gaping mouth
    ctx.beginPath();
    ctx.moveTo(headRadius * 0.5, -headRadius * 0.44);
    ctx.lineTo(headRadius * 1.15, 0);
    ctx.lineTo(headRadius * 0.5, headRadius * 0.44);
    ctx.closePath();
    ctx.fillStyle = "#0A0810";
    ctx.fill();

    // Teeth
    ctx.fillStyle = "#FFF";
    ctx.globalAlpha = alpha * 0.85;
    for (let i = -1; i <= 1; i++) {
      const ty = i * headRadius * 0.22;
      ctx.beginPath();
      ctx.moveTo(headRadius * 0.7, ty - headRadius * 0.09);
      ctx.lineTo(headRadius * 0.98, ty);
      ctx.lineTo(headRadius * 0.7, ty + headRadius * 0.09);
      ctx.closePath();
      ctx.fill();
    }

    // Eye
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(headRadius * 0.22, -headRadius * 0.4, headRadius * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = "#FFF";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(headRadius * 0.28, -headRadius * 0.4, headRadius * 0.1, 0, Math.PI * 2);
    ctx.fillStyle = "#111";
    ctx.fill();

    // Lure — stalk arcs forward over the head, bulb bobbing on the end
    const bob = reducedMotion ? 0 : Math.sin(time * 2.2 + t.wigglePhase) * headRadius * 0.26;
    const lureX = headRadius * 1.5;
    const lureY = -headRadius * 1.1 + bob;
    ctx.beginPath();
    ctx.moveTo(-headRadius * 0.25, -headRadius * 0.78);
    ctx.quadraticCurveTo(headRadius * 0.85, -headRadius * 1.75, lureX, lureY);
    ctx.strokeStyle = "#1A1626";
    ctx.lineWidth = Math.max(0.5, headRadius * 0.11);
    ctx.lineCap = "round";
    ctx.stroke();

    ctx.shadowColor = t.color;
    ctx.shadowBlur = headRadius * 2.5;
    ctx.beginPath();
    ctx.arc(lureX, lureY, headRadius * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = t.color;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(lureX, lureY, headRadius * 0.13, 0, Math.PI * 2);
    ctx.fillStyle = "#FFF";
    ctx.globalAlpha = alpha * 0.9;
    ctx.fill();

    ctx.restore(); // also clears shadowBlur
    ctx.globalAlpha = 1;
  },
});

// Puffer: inflates and bristles as it closes on the cursor, deflates as it drifts off (~1 in 45)
registerVariant("puffer", {
  weight: 3.5,
  sizeMul: 2,
  speedMul: 0.75,
  draw(ctx, t, time, alpha, headRadius, speed, reducedMotion) {
    // t.arrival is already the smoothed 0→1 cursor-proximity blend the physics computes
    const puff = t.arrival;
    const bodyRadius = headRadius * (1 + puff * 0.6);
    const spikeLen = bodyRadius * 0.42 * puff;

    // Tail tucks in as it inflates
    drawTadpoleTail(ctx, t, time, alpha, headRadius * (1 - puff * 0.4), speed, reducedMotion);

    if (spikeLen > 0.4) {
      const SPIKES = 12;
      const bristle = reducedMotion ? 0 : Math.sin(time * 9 + t.wigglePhase) * 0.06;
      ctx.globalAlpha = alpha * 0.9;
      ctx.fillStyle = t.color;
      for (let i = 0; i < SPIKES; i++) {
        const a = t.heading + (i / SPIKES) * Math.PI * 2 + bristle;
        const halfBase = 0.11;
        ctx.beginPath();
        ctx.moveTo(
          t.x + Math.cos(a - halfBase) * bodyRadius,
          t.y + Math.sin(a - halfBase) * bodyRadius
        );
        ctx.lineTo(
          t.x + Math.cos(a) * (bodyRadius + spikeLen),
          t.y + Math.sin(a) * (bodyRadius + spikeLen)
        );
        ctx.lineTo(
          t.x + Math.cos(a + halfBase) * bodyRadius,
          t.y + Math.sin(a + halfBase) * bodyRadius
        );
        ctx.closePath();
        ctx.fill();
      }
    }

    ctx.beginPath();
    ctx.arc(t.x, t.y, bodyRadius, 0, Math.PI * 2);
    ctx.fillStyle = t.color;
    ctx.globalAlpha = alpha;
    ctx.fill();

    drawEyes(ctx, t, alpha, bodyRadius * 0.75);
  },
});

// Eel: long undulating ribbon body with a wedge nose, breaking from the head-circle-plus-tail silhouette (~1 in 67)
registerVariant("eel", {
  weight: 2.5,
  sizeMul: 1.6,
  speedMul: 0.85,
  draw(ctx, t, time, alpha, headRadius, speed, reducedMotion) {
    const waveSpeed = reducedMotion ? 0 : 6 + speed * 0.02;

    // Trace the body from a pointed nose, through the head, along the tail history —
    // a travelling sine wave (amplitude growing toward the tail) is layered on top,
    // then rendered as one tapered ribbon using the same left/right-edge technique
    // as drawTadpoleTail / the ghost tendrils.
    const points: Array<{ x: number; y: number; w: number }> = [];
    points.push({
      x: t.x + Math.cos(t.heading) * headRadius * 1.1,
      y: t.y + Math.sin(t.heading) * headRadius * 1.1,
      w: 0,
    });
    points.push({ x: t.x, y: t.y, w: headRadius * 0.52 });

    for (let i = 0; i < TAIL_SEGMENTS; i++) {
      const idx = ((t.tailHead - i) % TAIL_SEGMENTS + TAIL_SEGMENTS) % TAIL_SEGMENTS;
      const sx = t.tailX[idx];
      const sy = t.tailY[idx];

      let localAngle = t.heading;
      if (i < TAIL_SEGMENTS - 1) {
        const nextIdx = ((t.tailHead - i - 1) % TAIL_SEGMENTS + TAIL_SEGMENTS) % TAIL_SEGMENTS;
        const ddx = t.tailX[nextIdx] - sx;
        const ddy = t.tailY[nextIdx] - sy;
        if (ddx * ddx + ddy * ddy > 0.1) {
          localAngle = Math.atan2(ddy, ddx);
        }
      }
      const perpX = -Math.sin(localAngle);
      const perpY = Math.cos(localAngle);

      const frac = (i + 1) / TAIL_SEGMENTS; // 0 (near head) -> 1 (tail tip)
      const waveAmp = reducedMotion ? 0 : headRadius * (0.1 + frac * 0.75);
      const wave = reducedMotion
        ? 0
        : Math.sin(frac * 5.2 - time * waveSpeed + t.wigglePhase) * waveAmp;

      points.push({
        x: sx + perpX * wave,
        y: sy + perpY * wave,
        w: headRadius * 0.48 * Math.pow(1 - frac, 1.4), // tapers to a fine point at the tail
      });
    }

    ctx.beginPath();
    const p0 = points[0];
    const a0 = Math.atan2(points[1].y - p0.y, points[1].x - p0.x);
    ctx.moveTo(p0.x + Math.sin(a0) * p0.w, p0.y - Math.cos(a0) * p0.w);

    for (let i = 1; i < points.length; i++) {
      const curr = points[i];
      const prev = points[i - 1];
      const angle = Math.atan2(curr.y - prev.y, curr.x - prev.x);
      ctx.lineTo(curr.x + Math.sin(angle) * curr.w, curr.y - Math.cos(angle) * curr.w);
    }

    const tip = points[points.length - 1];
    ctx.lineTo(tip.x, tip.y);

    for (let i = points.length - 1; i >= 1; i--) {
      const curr = points[i];
      const prev = points[i - 1];
      const angle = Math.atan2(curr.y - prev.y, curr.x - prev.x);
      ctx.lineTo(curr.x - Math.sin(angle) * curr.w, curr.y + Math.cos(angle) * curr.w);
    }

    const aEnd = Math.atan2(points[1].y - p0.y, points[1].x - p0.x);
    ctx.lineTo(p0.x - Math.sin(aEnd) * p0.w, p0.y + Math.cos(aEnd) * p0.w);

    ctx.closePath();
    ctx.fillStyle = t.color;
    ctx.globalAlpha = alpha;
    ctx.fill();

    drawEyes(ctx, t, alpha, headRadius * 0.6);
  },
});

// Seahorse: upright S-curved body with a curling tail and a rapid-flutter dorsal fin — stays vertical regardless of travel direction (~1 in 84)
registerVariant("seahorse", {
  weight: 2,
  sizeMul: 2.2,
  speedMul: 0.5,
  draw(ctx, t, time, alpha, headRadius, _speed, reducedMotion) {
    const R = headRadius;

    // Gentle hover bob (world-vertical, applied before rotation so it never tilts)
    const bob = reducedMotion ? 0 : Math.sin(time * 2.2 + t.wigglePhase) * R * 0.12;
    // Small lean into the direction of travel — a few degrees off vertical, never full rotation
    const lean = Math.max(-0.28, Math.min(0.28, t.vx * 0.012));
    // Mirror horizontally based on travel direction (heading is already smoothed, so this
    // doesn't flicker the way raw vx would near zero speed)
    const facing = Math.cos(t.heading) < 0 ? -1 : 1;

    ctx.save();
    ctx.translate(t.x, t.y + bob);
    ctx.rotate(lean);
    ctx.scale(facing, 1);

    // Body spine: snout -> crown -> nape -> chest (S-curve) -> belly -> coiled tail tip.
    // Coordinates assume facing = +1 (snout points toward +x); scale() above mirrors it.
    const spine = [
      { x: 1.60, y: -1.55, w: 0.08 }, // snout tip
      { x: 1.05, y: -1.70, w: 0.16 }, // snout base
      { x: 0.30, y: -1.80, w: 0.58 }, // crown
      { x: -0.25, y: -1.50, w: 0.42 }, // nape
      { x: -0.05, y: -1.00, w: 0.44 }, // neck
      { x: 0.55, y: -0.45, w: 0.75 }, // chest (widest)
      { x: 0.15, y: 0.15, w: 0.55 }, // belly
      { x: -0.30, y: 0.65, w: 0.36 }, // tail base
      { x: 0.05, y: 1.05, w: 0.24 }, // tail curl 1
      { x: 0.45, y: 1.20, w: 0.14 }, // tail curl 2
      { x: 0.30, y: 1.50, w: 0.04 }, // tail tip, curling back inward
    ].map((p) => ({ x: p.x * R, y: p.y * R, w: p.w * R }));

    const left: Array<{ x: number; y: number }> = [];
    const right: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < spine.length; i++) {
      const curr = spine[i];
      const next = spine[Math.min(i + 1, spine.length - 1)];
      const prev = spine[Math.max(i - 1, 0)];
      const dirAngle = Math.atan2(next.y - prev.y, next.x - prev.x);
      const px = -Math.sin(dirAngle);
      const py = Math.cos(dirAngle);
      left.push({ x: curr.x + px * curr.w, y: curr.y + py * curr.w });
      right.push({ x: curr.x - px * curr.w, y: curr.y - py * curr.w });
    }

    ctx.beginPath();
    ctx.moveTo(left[0].x, left[0].y);
    for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y);
    ctx.lineTo(spine[spine.length - 1].x, spine[spine.length - 1].y); // tail tip
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
    ctx.closePath();
    ctx.fillStyle = t.color;
    ctx.globalAlpha = alpha;
    ctx.fill();

    // Dorsal fin — 3 thin blades riding the back edge from nape through chest, fluttering
    // rapidly (real seahorses paddle this fin fast to move, unlike the slow body wiggle)
    const finFreq = 20;
    const finIdx = [3, 4, 5];
    ctx.globalAlpha = alpha * 0.8;
    for (let i = 0; i < finIdx.length; i++) {
      const idx = finIdx[i];
      const base = left[idx];
      const nx = base.x - spine[idx].x;
      const ny = base.y - spine[idx].y;
      const nlen = Math.hypot(nx, ny) || 1;
      const ux = nx / nlen;
      const uy = ny / nlen;
      const flutter = reducedMotion ? 0 : Math.sin(time * finFreq + i * 1.8 + t.wigglePhase);
      const finLen = R * (0.5 + flutter * 0.25);
      const tipX = base.x + ux * finLen;
      const tipY = base.y + uy * finLen;
      const perpX = -uy;
      const perpY = ux;
      const halfW = R * 0.1;
      ctx.beginPath();
      ctx.moveTo(base.x + perpX * halfW, base.y + perpY * halfW);
      ctx.lineTo(tipX, tipY);
      ctx.lineTo(base.x - perpX * halfW, base.y - perpY * halfW);
      ctx.closePath();
      ctx.fill();
    }

    // Eye — single eye near the crown/snout junction (profile view; only one side ever shows)
    const eyeX = R * 0.5;
    const eyeY = R * -1.55;
    const eyeR = R * 0.22;
    ctx.globalAlpha = alpha * 0.95;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(eyeX, eyeY, eyeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#222";
    ctx.beginPath();
    ctx.arc(eyeX + eyeR * 0.25, eyeY, eyeR * 0.55, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    ctx.globalAlpha = 1;
  },
});

// Axolotl: the tadpole that never grew up — wide smiling head, six waving gill fronds, four stubby legs (~1 in 67)
registerVariant("axolotl", {
  weight: 2.5,
  sizeMul: 2.4,
  speedMul: 0.6,
  draw(ctx, t, time, alpha, headRadius, speed, reducedMotion) {
    drawTadpoleTail(ctx, t, time, alpha, headRadius, speed, reducedMotion);

    const bodyLen = headRadius * 0.95;
    const bodyWide = headRadius * 1.15;

    // Body + legs wash toward a pale pink-white so the player's hue reads as an
    // undertone rather than the whole creature — gills stay in full color below.
    const paleFill = (mul = 1) => {
      ctx.fillStyle = t.color;
      ctx.globalAlpha = alpha * mul;
      ctx.fill();
      ctx.fillStyle = "#FFE9EE";
      ctx.globalAlpha = alpha * mul * 0.55;
      ctx.fill();
    };

    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate(t.heading);

    // Four stubby legs: a front pair near the head, a rear pair near the tail base
    const legPairs = [
      { lx: bodyLen * 0.1, loff: bodyWide * 0.85, scale: 1 },
      { lx: -bodyLen * 0.55, loff: bodyWide * 0.65, scale: 0.85 },
    ];
    for (const side of [-1, 1]) {
      for (const leg of legPairs) {
        const kick = reducedMotion ? 0 : Math.sin(time * 5 + t.wigglePhase + leg.lx) * 0.15;
        const legLen = headRadius * 0.5 * leg.scale;
        const legWidth = headRadius * 0.22 * leg.scale;
        ctx.save();
        ctx.translate(leg.lx, side * leg.loff);
        ctx.rotate(side * (0.6 + kick));
        ctx.beginPath();
        ctx.ellipse(legLen * 0.5, 0, legLen * 0.5, legWidth * 0.5, 0, 0, Math.PI * 2);
        paleFill();
        for (let toe = -1; toe <= 1; toe++) {
          ctx.beginPath();
          ctx.arc(legLen * 0.95, toe * legWidth * 0.35, legWidth * 0.22, 0, Math.PI * 2);
          paleFill();
        }
        ctx.restore();
      }
    }

    // Six feathery gill fronds (3 per side): stalks fan from mostly-outward to
    // mostly-backward off the neck, each with a few short branching filaments
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const spread = 1.95 + i * 0.4;
        const wobble = reducedMotion ? 0 : Math.sin(time * 3.1 + t.wigglePhase + i * 1.7 + side) * 0.2;
        const a = spread + wobble;
        const dirX = Math.cos(a);
        const dirY = Math.sin(a) * side;
        const stalkLen = headRadius * (0.8 + i * 0.14);
        const attachX = -bodyLen * (0.12 + i * 0.13);
        const attachY = side * bodyWide * 0.78;
        const tipX = attachX + dirX * stalkLen;
        const tipY = attachY + dirY * stalkLen;
        const midX = attachX + dirX * stalkLen * 0.5 - dirY * headRadius * 0.12;
        const midY = attachY + dirY * stalkLen * 0.5 + dirX * headRadius * 0.12;

        ctx.beginPath();
        ctx.moveTo(attachX, attachY);
        ctx.quadraticCurveTo(midX, midY, tipX, tipY);
        ctx.strokeStyle = t.color;
        ctx.lineWidth = Math.max(0.5, headRadius * 0.1);
        ctx.lineCap = "round";
        ctx.globalAlpha = alpha * 0.85;
        ctx.stroke();

        const perpX = -dirY;
        const perpY = dirX;
        for (let f = 1; f <= 3; f++) {
          const frac = f / 4;
          const bx = attachX + (tipX - attachX) * frac;
          const by = attachY + (tipY - attachY) * frac;
          const filLen = stalkLen * (0.4 - frac * 0.15);
          const fs = f % 2 === 0 ? 1 : -1;
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.lineTo(
            bx + dirX * filLen * 0.4 + perpX * filLen * fs,
            by + dirY * filLen * 0.4 + perpY * filLen * fs
          );
          ctx.lineWidth = Math.max(0.4, headRadius * 0.055);
          ctx.stroke();
        }
      }
    }

    // Wide rounded head/body
    ctx.beginPath();
    ctx.ellipse(0, 0, bodyLen, bodyWide, 0, 0, Math.PI * 2);
    paleFill();

    // Permanent smile
    const mouthX = bodyLen * 0.72;
    const mouthSpan = bodyWide * 0.4;
    ctx.beginPath();
    ctx.moveTo(mouthX - mouthSpan, headRadius * 0.1);
    ctx.quadraticCurveTo(mouthX, headRadius * 0.32, mouthX + mouthSpan, headRadius * 0.1);
    ctx.strokeStyle = "#3d2228";
    ctx.lineWidth = Math.max(0.5, headRadius * 0.07);
    ctx.lineCap = "round";
    ctx.globalAlpha = alpha * 0.8;
    ctx.stroke();

    // Two small dark dot eyes, set wide apart
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#241014";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(bodyLen * 0.35, side * bodyWide * 0.58, headRadius * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
    ctx.globalAlpha = 1;
  },
});

// Starfish: radially-symmetric tumbler that spins freely instead of facing its heading (~1 in 84)
registerVariant("starfish", {
  weight: 2,
  sizeMul: 2.2,
  speedMul: 0.45,
  draw(ctx, t, time, alpha, headRadius, _speed, reducedMotion) {
    const ARMS = 5;
    const SEGMENTS_PER_ARM = 14; // dense enough that the sinusoidal outline reads as one smooth path
    const outerR = headRadius * 1.15; // arm-tip radius
    const innerR = headRadius * 0.5; // valley (armpit) radius — shallow, not a sharp notch
    // Tumbles continuously from its own time-phase rather than tracking t.heading — the
    // whole point of the creature is that it doesn't "point" anywhere.
    const rotation = reducedMotion ? t.wigglePhase : time * 0.18 + t.wigglePhase;

    ctx.globalAlpha = alpha;
    ctx.fillStyle = t.color;
    ctx.beginPath();
    const totalSegments = ARMS * SEGMENTS_PER_ARM;
    for (let i = 0; i <= totalSegments; i++) {
      const theta = (i / totalSegments) * Math.PI * 2;
      const lobe = 0.5 + 0.5 * Math.cos(ARMS * theta); // 1 at each tip, 0 at each valley
      const shaped = Math.pow(lobe, 1.7); // sharpens the taper near the tip, flattens the valley
      const r = innerR + (outerR - innerR) * shaped;
      const angle = theta + rotation;
      const x = t.x + Math.cos(angle) * r;
      const y = t.y + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

    // Central disc reads as a slightly raised hub
    ctx.beginPath();
    ctx.arc(t.x, t.y, innerR * 0.62, 0, Math.PI * 2);
    ctx.fillStyle = "#000";
    ctx.globalAlpha = alpha * 0.16;
    ctx.fill();

    // Deterministic ring of texture dots running down each arm (never Math.random — would strobe)
    const DOTS_PER_ARM = 3;
    ctx.fillStyle = "#000";
    ctx.globalAlpha = alpha * 0.22;
    for (let a = 0; a < ARMS; a++) {
      const armAngle = (a / ARMS) * Math.PI * 2 + rotation;
      for (let d = 1; d <= DOTS_PER_ARM; d++) {
        const dFrac = d / (DOTS_PER_ARM + 1);
        const dr = innerR + (outerR - innerR) * dFrac * 0.85;
        const dotR = headRadius * 0.09 * (1 - dFrac * 0.4);
        ctx.beginPath();
        ctx.arc(
          t.x + Math.cos(armAngle) * dr,
          t.y + Math.sin(armAngle) * dr,
          dotR, 0, Math.PI * 2
        );
        ctx.fill();
      }
    }

    ctx.globalAlpha = 1;
  },
});

// Whale shark: the "whoa" giant — biggest thing in the pond by far, spotted back, slow lunate tail sweep (~1 in 337)
registerVariant("whaleshark", {
  weight: 0.5,
  sizeMul: 4.5,
  speedMul: 0.35,
  draw(ctx, t, time, alpha, headRadius, _speed, reducedMotion) {
    // Derive a dark "back" tone and a pale "belly" tone from the player's color so
    // identity still reads through hue, without needing a shared color-math helper.
    const hex = t.color.replace("#", "");
    const cr = parseInt(hex.substring(0, 2), 16) || 0;
    const cg = parseInt(hex.substring(2, 4), 16) || 0;
    const cb = parseInt(hex.substring(4, 6), 16) || 0;
    const darkColor = `rgb(${Math.round(cr * 0.32)}, ${Math.round(cg * 0.32)}, ${Math.round(cb * 0.38)})`;
    const paleColor = `rgb(${Math.round(cr + (255 - cr) * 0.85)}, ${Math.round(cg + (255 - cg) * 0.85)}, ${Math.round(cb + (255 - cb) * 0.85)})`;

    const bodyLen = headRadius * 3.4;
    const halfLen = bodyLen * 0.5;
    const snoutX = halfLen;
    const snoutHalfW = headRadius * 0.62;
    const shoulderX = halfLen * 0.42;
    const maxHalfW = headRadius * 1.05;
    const midX = -halfLen * 0.15;
    const midHalfW = maxHalfW * 0.82;
    const peduncleX = -halfLen * 0.82;
    const peduncleHalfW = headRadius * 0.2;
    const tailBaseX = -halfLen;

    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate(t.heading);
    ctx.globalAlpha = alpha;

    // Tall lunate tail, swept slowly and heavily — this creature never hurries
    const sweep = reducedMotion ? 0 : Math.sin(time * 0.9 + t.wigglePhase) * 0.2;
    ctx.save();
    ctx.translate(tailBaseX, 0);
    ctx.rotate(sweep);
    const tailReach = headRadius * 1.55;
    const tailSpan = headRadius * 1.7;
    ctx.fillStyle = darkColor;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0, side * peduncleHalfW * 0.7);
      ctx.bezierCurveTo(
        -tailReach * 0.35, side * tailSpan * 0.55,
        -tailReach * 0.85, side * tailSpan,
        -tailReach, side * tailSpan * 0.3
      );
      ctx.bezierCurveTo(
        -tailReach * 0.78, side * tailSpan * 0.05,
        -tailReach * 0.5, 0,
        -tailReach * 0.28, 0
      );
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // Pectoral fins — swept back, jutting out past the body's silhouette
    const pecX = shoulderX * 0.5;
    const pecBaseW = maxHalfW * 0.75;
    const pecTipX = pecX - headRadius * 1.3;
    const pecTipW = pecBaseW + headRadius * 0.95;
    ctx.fillStyle = darkColor;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(pecX + headRadius * 0.35, side * pecBaseW * 0.85);
      ctx.lineTo(pecTipX, side * pecTipW);
      ctx.lineTo(pecX - headRadius * 0.25, side * pecBaseW * 0.6);
      ctx.closePath();
      ctx.fill();
    }

    // Dorsal fin — single triangle on the back edge, near the shoulder
    const dorsalX = shoulderX * 0.15;
    const dorsalBaseHalf = headRadius * 0.55;
    const dorsalHeight = headRadius * 1.35;
    const dorsalEdgeY = -maxHalfW * 0.92;
    ctx.beginPath();
    ctx.moveTo(dorsalX + dorsalBaseHalf * 0.6, dorsalEdgeY * 0.75);
    ctx.lineTo(dorsalX - dorsalBaseHalf * 0.7, dorsalEdgeY * 0.85);
    ctx.lineTo(dorsalX - dorsalBaseHalf * 0.15, dorsalEdgeY - dorsalHeight);
    ctx.closePath();
    ctx.fill();

    // Body — broad flattened snout tapering to the tail peduncle, dark back fading
    // to a pale belly. Gradient coords are local since we already translated/rotated.
    ctx.beginPath();
    ctx.moveTo(snoutX, -snoutHalfW);
    ctx.bezierCurveTo(snoutX * 0.55, -maxHalfW * 0.98, shoulderX, -maxHalfW, midX, -midHalfW);
    ctx.bezierCurveTo(midX - halfLen * 0.18, -midHalfW * 0.92, peduncleX + halfLen * 0.12, -peduncleHalfW * 2.2, peduncleX, -peduncleHalfW);
    ctx.lineTo(tailBaseX, -peduncleHalfW * 0.55);
    ctx.lineTo(tailBaseX, peduncleHalfW * 0.55);
    ctx.lineTo(peduncleX, peduncleHalfW);
    ctx.bezierCurveTo(peduncleX + halfLen * 0.12, peduncleHalfW * 2.2, midX - halfLen * 0.18, midHalfW * 0.92, midX, midHalfW);
    ctx.bezierCurveTo(shoulderX, maxHalfW, snoutX * 0.55, maxHalfW * 0.98, snoutX, snoutHalfW);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, -maxHalfW, 0, maxHalfW);
    grad.addColorStop(0, darkColor);
    grad.addColorStop(0.62, darkColor);
    grad.addColorStop(1, paleColor);
    ctx.fillStyle = grad;
    ctx.fill();

    // Spotted back — grid of pale spots seeded from t.id so they stay fixed
    // per-creature instead of re-randomizing (and strobing) every frame.
    ctx.fillStyle = paleColor;
    const SPOT_ROWS = 4;
    const SPOTS_PER_ROW = 3;
    for (let row = 0; row < SPOT_ROWS; row++) {
      const rowFrac = row / (SPOT_ROWS - 1);
      const rowX = shoulderX - rowFrac * (shoulderX - peduncleX * 0.7);
      const rowHalfW = maxHalfW - rowFrac * (maxHalfW - peduncleHalfW * 2);
      for (let col = 0; col < SPOTS_PER_ROW; col++) {
        const seed = t.id * 131 + row * 977 + col * 7919;
        const jitterX = (seededRandom(seed) - 0.5) * headRadius * 0.6;
        const jitterY = (seededRandom(seed + 1) - 0.5) * rowHalfW * 0.4;
        const colFrac = col / (SPOTS_PER_ROW - 1) - 0.5;
        const spotY = -rowHalfW * (0.3 + Math.abs(colFrac) * 0.55) + jitterY;
        const spotR = headRadius * (0.09 + seededRandom(seed + 2) * 0.06);
        ctx.beginPath();
        ctx.arc(rowX + jitterX, spotY, spotR, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Small eyes near the snout tip — deliberately tiny, true to the real animal
    ctx.fillStyle = "#1A1A1A";
    ctx.globalAlpha = alpha * 0.85;
    const eyeX = snoutX - headRadius * 0.35;
    const eyeYOff = snoutHalfW * 0.55;
    const eyeR = headRadius * 0.09;
    ctx.beginPath();
    ctx.arc(eyeX, -eyeYOff, eyeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(eyeX, eyeYOff, eyeR, 0, Math.PI * 2);
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

    // A scrollable ancestor means the user is trying to scroll content (the chat
    // log, say), not drag the pond — a tag-name allowlist alone misses those.
    function hasScrollableAncestor(el: Element | null): boolean {
      let node: Element | null = el;
      while (node && node !== document.body) {
        const overflowY = window.getComputedStyle(node).overflowY;
        if (
          (overflowY === "auto" || overflowY === "scroll") &&
          node.scrollHeight > node.clientHeight
        ) {
          return true;
        }
        node = node.parentElement;
      }
      return false;
    }

    // Decided once per gesture: touchmove fires far too often to afford a
    // getComputedStyle walk on every event.
    let suppressTouchScroll = false;

    function handleTouchStart(e: TouchEvent) {
      const target = e.target as Element;
      suppressTouchScroll =
        interactiveRef.current &&
        !isUIElement(target) &&
        !hasScrollableAncestor(target);
    }

    function handleTouchMove(e: TouchEvent) {
      if (!suppressTouchScroll) return;
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
    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("dragstart", handleDragStart);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("touchstart", handleTouchStart);
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

    let lastDpr = window.devicePixelRatio || 1;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      lastDpr = dpr;
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

    let paused = false;

    function handleVisibility() {
      if (document.hidden && !paused) {
        paused = true;
        cancelAnimationFrame(animFrameRef.current);
      } else if (!document.hidden && paused) {
        paused = false;
        lastFrameTime.current = 0; // fall back to a 16ms dt instead of the whole gap
        animFrameRef.current = requestAnimationFrame(draw);
      }
    }

    document.addEventListener("visibilitychange", handleVisibility);

    function draw(now: number) {
      // Dragging the window to a display with a different pixel ratio changes
      // devicePixelRatio without firing a resize event.
      if ((window.devicePixelRatio || 1) !== lastDpr) resize();

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

        // Update physics (the post-update filter below leaves this clean)
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
        // Update physics (the post-update filter below leaves this clean)
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

      animFrameRef.current = requestAnimationFrame(draw);
    }

    animFrameRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", handleVisibility);

      // Tadpoles come from a module-level pool guarded by a shared alive-count.
      // Without releasing them here the count leaks on every navigation until it
      // hits MAX_TADPOLES_TOTAL and spawning silently stops for the tab's life.
      for (const t of localTadpolesRef.current) {
        if (t.alive) killTadpole(t);
      }
      localTadpolesRef.current = [];
      for (const [, state] of playersRef.current) {
        for (const t of state.tadpoles) {
          if (t.alive) killTadpole(t);
        }
        state.tadpoles = [];
      }
      playersRef.current.clear();
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
