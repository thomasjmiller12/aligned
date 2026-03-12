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

export function getScoreColor(score: number): string {
  switch (score) {
    case 4:
      return "#FBBF24";
    case 3:
      return "#2DD4BF";
    case 2:
      return "#A7F3D0";
    default:
      return "#6B6B6B";
  }
}
