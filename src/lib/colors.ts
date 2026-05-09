export const PLAYER_COLORS = [
  "#E8553A",
  "#2A9D8F",
  "#7C3AED",
  "#F59E0B",
  "#EC4899",
  "#06B6D4",
  "#84CC16",
  "#F97316",
  "#8B5CF6",
  "#14B8A6",
  "#DC2626",
  "#0EA5E9",
  "#D946EF",
  "#65A30D",
  "#0891B2",
  "#E11D48",
] as const;

export type PlayerColor = (typeof PLAYER_COLORS)[number];

export function isPlayerColor(value: string): value is PlayerColor {
  return (PLAYER_COLORS as readonly string[]).includes(value);
}
