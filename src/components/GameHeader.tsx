"use client";

import { motion } from "framer-motion";
import { Copy, Check } from "lucide-react";
import { useState } from "react";

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

  function copyCode() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <header className="flex items-center justify-between px-4 py-3">
      {/* Game Code */}
      <button
        onClick={copyCode}
        className="flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-sm font-bold tracking-widest shadow-sm transition-all hover:shadow-md"
      >
        {code}
        {copied ? (
          <Check className="h-3.5 w-3.5 text-success" />
        ) : (
          <Copy className="h-3.5 w-3.5 text-text-secondary" />
        )}
      </button>

      {/* Team Score */}
      {status !== "lobby" && (
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

      {/* Round Indicator */}
      {status !== "lobby" && status !== "game_over" && (
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
    </header>
  );
}
