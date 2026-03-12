"use client";

import { Doc } from "../../convex/_generated/dataModel";

interface PlayerBarProps {
  players: Doc<"players">[];
  currentRound: Doc<"rounds"> | null | undefined;
  sessionId: string;
  playerScores?: Record<string, number> | null;
  showScores?: boolean;
}

export default function PlayerBar({
  players,
  currentRound,
  sessionId,
  playerScores,
  showScores = false,
}: PlayerBarProps) {
  const sorted = [...players].sort((a, b) => a.order - b.order);

  return (
    <div className="flex justify-center gap-2 px-4 py-2">
      {sorted.map((player) => {
        const isClueGiver = currentRound?.clueGiverId === player._id;
        const isMe = player.sessionId === sessionId;
        const score = playerScores?.[player._id] ?? 0;

        return (
          <div key={player._id} className="flex flex-col items-center gap-1">
            <div className="relative">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white transition-all ${
                  isClueGiver ? "ring-2 ring-offset-2" : ""
                } ${!player.isConnected ? "opacity-40" : ""}`}
                style={{
                  backgroundColor: player.color,
                  ...(isClueGiver
                    ? ({ "--tw-ring-color": player.color } as React.CSSProperties)
                    : {}),
                }}
              >
                {player.name.charAt(0).toUpperCase()}
              </div>
              {showScores && (
                <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-bold shadow-sm"
                  style={{ color: player.color }}
                >
                  {score}
                </div>
              )}
            </div>
            <span
              className={`text-xs ${isMe ? "font-bold text-text" : "text-text-secondary"}`}
            >
              {isMe ? "You" : player.name.split(" ")[0]}
            </span>
          </div>
        );
      })}
    </div>
  );
}
