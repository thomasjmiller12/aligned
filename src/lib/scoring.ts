// Scoring zone thresholds (degrees from target) — single source of truth
// These must stay in sync with convex/games.ts revealRound scoring
export const SCORE_ZONES = {
  BULLSEYE: 4,  // ±4° = 4pts
  CLOSE: 12,    // ±12° = 3pts
  NEAR: 20,     // ±20° = 2pts
} as const;

export function calculateScore(
  guessPosition: number,
  targetPosition: number
): number {
  const diff = Math.abs(guessPosition - targetPosition);
  if (diff <= SCORE_ZONES.BULLSEYE) return 4;
  if (diff <= SCORE_ZONES.CLOSE) return 3;
  if (diff <= SCORE_ZONES.NEAR) return 2;
  return 0;
}

export function getScoreLabel(score: number): string {
  switch (score) {
    case 4:
      return "Bullseye!";
    case 3:
      return "Close!";
    case 2:
      return "Near";
    default:
      return "Miss";
  }
}

/** Consumed via inline `style`/SVG fills, which can't read Tailwind utilities —
 *  so these mirror the deep-water tokens in globals.css by value.
 *  Warm surface light for the best guesses, cooling toward silt as you miss. */
export function getScoreColor(score: number): string {
  switch (score) {
    case 4:
      return "#FFDFA3"; // sun
    case 3:
      return "#6FE0D2"; // caustic
    case 2:
      return "#58D9A6"; // success
    default:
      return "#8FB2BC"; // silt
  }
}
