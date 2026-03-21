"use client";

import { motion } from "framer-motion";
import { Copy, Check, Volume2, VolumeX } from "lucide-react";
import { useState } from "react";
import { useSound } from "@/hooks/useSound";

interface GameHeaderProps {
  code: string;
  teamScore: number;
  currentRound: number;
  totalRounds: number;
  status: string;
}

export default function GameHeader({
  code,
  teamScore,
  currentRound,
  totalRounds,
  status,
}: GameHeaderProps) {
  const [copied, setCopied] = useState(false);
  const { isMuted, toggleMute } = useSound();

  function copyCode() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const showScore = status !== "lobby";
  const showRounds = status !== "lobby" && status !== "game_over";

  return (
    <header className="grid grid-cols-3 items-center px-4 py-3">
      {/* Game Code + Sound — left */}
      <div className="flex items-center gap-2 justify-start">
        <button
          onClick={copyCode}
          className="flex items-center gap-2 rounded-lg bg-white/70 backdrop-blur-sm border border-white/50 px-3 py-1.5 text-sm font-bold tracking-widest shadow-sm transition-all hover:shadow-md"
        >
          {code}
          {copied ? (
            <Check className="h-3.5 w-3.5 text-success" />
          ) : (
            <Copy className="h-3.5 w-3.5 text-text-secondary" />
          )}
        </button>
        <button
          onClick={toggleMute}
          className="flex items-center justify-center rounded-lg bg-white/70 backdrop-blur-sm border border-white/50 p-1.5 shadow-sm transition-all hover:shadow-md"
          aria-label={isMuted ? "Unmute sounds" : "Mute sounds"}
        >
          {isMuted ? (
            <VolumeX className="h-3.5 w-3.5 text-text-secondary" />
          ) : (
            <Volume2 className="h-3.5 w-3.5 text-text-secondary" />
          )}
        </button>
      </div>

      {/* Team Score — center */}
      <div className="flex justify-center">
        {showScore && (
          <div className="text-center">
            <div className="text-xs font-medium uppercase tracking-wider text-text-secondary">
              Team Score
            </div>
            <motion.div
              key={teamScore}
              initial={{ scale: 1.3 }}
              animate={{ scale: 1 }}
              className="text-2xl font-bold text-primary tabular-nums"
            >
              {teamScore}
            </motion.div>
          </div>
        )}
      </div>

      {/* Round Indicator — right */}
      <div className="flex justify-end">
        {showRounds && (
          <div className="flex items-center gap-1.5">
            {Array.from({ length: totalRounds }).map((_, i) => (
              <div
                key={i}
                className={`h-2 w-2 rounded-full transition-colors ${
                  i < currentRound
                    ? "bg-success"
                    : i === currentRound
                      ? "bg-primary"
                      : "bg-gray-200"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </header>
  );
}
