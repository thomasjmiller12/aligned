export function calculateScore(
  guessPosition: number,
  targetPosition: number
): number {
  const diff = Math.abs(guessPosition - targetPosition);
  if (diff <= 5) return 4;
  if (diff <= 10) return 3;
  if (diff <= 15) return 2;
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
      return "#FFD700";
    case 3:
      return "#FF9800";
    case 2:
      return "#FF7043";
    default:
      return "#6B6B6B";
  }
}
