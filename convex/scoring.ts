// Scoring thresholds — keep in sync with src/lib/scoring.ts SCORE_ZONES
export const BULLSEYE = 4;
export const CLOSE = 12;
export const NEAR = 20;

/** Points a single guess earns, given its distance from the target in degrees. */
export function scoreGuess(
  guessPosition: number,
  targetPosition: number
): number {
  const diff = Math.abs(guessPosition - targetPosition);
  if (diff <= BULLSEYE) return 4;
  if (diff <= CLOSE) return 3;
  if (diff <= NEAR) return 2;
  return 0;
}
