// Web Audio API sound synthesis for Aligned
// All sounds are procedurally generated — no audio files needed.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function isMuted(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem("aligned-sound-muted") === "true";
}

export function setMuted(muted: boolean) {
  localStorage.setItem("aligned-sound-muted", muted ? "true" : "false");
}

export function getMuted(): boolean {
  return isMuted();
}

// --- Helpers ---

function playTone(
  freq: number,
  duration: number,
  type: OscillatorType = "sine",
  volume = 0.15,
) {
  if (isMuted()) return;
  const ac = getCtx();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + duration);
}

function playFreqSweep(
  startFreq: number,
  endFreq: number,
  duration: number,
  type: OscillatorType = "sine",
  volume = 0.12,
) {
  if (isMuted()) return;
  const ac = getCtx();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(startFreq, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(endFreq, ac.currentTime + duration);
  gain.gain.setValueAtTime(volume, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + duration);
}

function playNoiseBurst(duration: number, filterFreq: number, volume = 0.06) {
  if (isMuted()) return;
  const ac = getCtx();
  const bufferSize = ac.sampleRate * duration;
  const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const source = ac.createBufferSource();
  source.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = filterFreq;
  filter.Q.value = 1.5;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(volume, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
  source.connect(filter).connect(gain).connect(ac.destination);
  source.start();
  source.stop(ac.currentTime + duration);
}

function playChord(
  freqs: number[],
  duration: number,
  type: OscillatorType = "sine",
  volume = 0.1,
) {
  if (isMuted()) return;
  const ac = getCtx();
  const gain = ac.createGain();
  gain.gain.setValueAtTime(volume, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
  gain.connect(ac.destination);
  for (const freq of freqs) {
    const osc = ac.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(gain);
    osc.start();
    osc.stop(ac.currentTime + duration);
  }
}

function playArpeggio(
  freqs: number[],
  noteLen: number,
  volume = 0.12,
  holdLast = false,
) {
  if (isMuted()) return;
  const ac = getCtx();
  freqs.forEach((freq, i) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const start = ac.currentTime + i * noteLen;
    const dur = i === freqs.length - 1 && holdLast ? noteLen * 3 : noteLen * 1.2;
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(start);
    osc.stop(start + dur);
  });
}

// --- Sound effects ---

/** Dial: pointer down — short rising tone */
export function playDialDragStart() {
  playFreqSweep(300, 500, 0.08, "sine", 0.1);
}

/** Dial: tick every ~10° during drag */
export function playDialTick() {
  playNoiseBurst(0.015, 2000, 0.04);
}

/** Dial: pointer up / snap to arc */
export function playDialLand() {
  playTone(200, 0.15, "sine", 0.12);
}

/** Lock In button pressed */
export function playLockIn() {
  playChord([523, 659], 0.2, "sine", 0.12); // C5 + E5
}

/** Score reveal — sound varies by score */
export function playScoreReveal(score: number) {
  if (score === 4) {
    // Bullseye — bright ascending arpeggio
    playArpeggio([523, 659, 784, 1047], 0.1, 0.14, true); // C5-E5-G5-C6
  } else if (score === 3) {
    // Close — two ascending notes
    playArpeggio([523, 784], 0.12, 0.12);
  } else if (score === 2) {
    // Near — single pleasant note
    playTone(523, 0.2, "sine", 0.1);
  } else {
    // Miss — soft descending
    playFreqSweep(330, 262, 0.2, "sine", 0.06); // E4 → C4
  }
}

/** Game over — celebratory fanfare */
export function playGameOver() {
  playArpeggio([262, 330, 392, 523], 0.15, 0.14, true); // C4-E4-G4-C5
}

/** Timer warning at 30s (gentle) or 10s (urgent double ping) */
export function playTimerWarning(urgent: boolean) {
  if (urgent) {
    playTone(880, 0.1, "sine", 0.08);
    setTimeout(() => playTone(880, 0.1, "sine", 0.1), 150);
  } else {
    playTone(880, 0.1, "sine", 0.06);
  }
}

/** Generic button click */
export function playButtonClick() {
  playTone(600, 0.03, "triangle", 0.06);
}

/** Clue submitted successfully */
export function playClueSubmitted() {
  playTone(880, 0.15, "sine", 0.08); // A5
}

/** Phase transition whoosh */
export function playPhaseTransition() {
  playNoiseBurst(0.3, 800, 0.05);
}

/** Player joined the lobby */
export function playPlayerJoined() {
  playFreqSweep(400, 600, 0.08, "sine", 0.08);
}
