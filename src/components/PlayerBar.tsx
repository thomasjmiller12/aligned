"use client";

import { motion } from "framer-motion";
import { Eye } from "lucide-react";
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
  const sorted = [...players].sort((a, b) => {
    // Spectators after regular players
    if (a.isSpectator && !b.isSpectator) return 1;
    if (!a.isSpectator && b.isSpectator) return -1;
    return a.order - b.order;
  });

  return (
    <div className="flex flex-wrap justify-center gap-2 px-4 py-2">
      {sorted.map((player, i) => {
        const isClueGiver = currentRound?.clueGiverId === player._id;
        const isMe = player.sessionId === sessionId;
        const score = playerScores?.[player._id] ?? 0;
        const disconnected = !player.isConnected;

        return (
          <motion.div
            key={player._id}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.1 }}
            className="flex flex-col items-center gap-1"
          >
            <div className="relative">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-foam transition-all ${
                  isClueGiver ? "ring-2 ring-sun ring-offset-2 ring-offset-deep" : ""
                } ${disconnected ? "ring-2 ring-silt/60 ring-offset-2 ring-offset-deep" : ""} ${
                  disconnected || player.isSpectator ? "opacity-40" : ""
                }`}
                style={{ backgroundColor: player.color }}
              >
                {player.name.charAt(0).toUpperCase()}
              </div>
              {player.isSpectator ? (
                <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-abyss ring-1 ring-caustic/20">
                  <Eye className="h-3 w-3 text-silt" />
                </div>
              ) : showScores ? (
                <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-abyss text-[10px] font-bold ring-1 ring-caustic/20"
                  style={{ color: player.color }}
                >
                  {score}
                </div>
              ) : null}
            </div>
            <span
              className={`text-xs ${isMe ? "font-bold text-foam" : "text-silt"}`}
            >
              {isMe ? "You" : player.name.split(" ")[0]}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}
