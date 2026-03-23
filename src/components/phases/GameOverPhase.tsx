"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc } from "../../../convex/_generated/dataModel";
import { motion } from "framer-motion";
import { Trophy, RotateCcw, Home } from "lucide-react";
import Link from "next/link";
import Confetti from "../Confetti";
import { useEffect, useRef } from "react";
import { playGameOver } from "@/lib/sounds";

interface GameOverPhaseProps {
  game: Doc<"games">;
  players: Doc<"players">[];
  isHost: boolean;
  sessionId: string;
  playerScores?: Record<string, number> | null;
  myPlayer: Doc<"players"> | null;
}

export default function GameOverPhase({
  game,
  players,
  isHost,
  sessionId,
  playerScores,
  myPlayer,
}: GameOverPhaseProps) {
  const rounds = useQuery(api.games.getRounds, {
    gameId: game._id,
    sessionId,
  });
  const playAgain = useMutation(api.games.playAgain);

  // Play game over fanfare once
  const soundPlayedRef = useRef(false);
  useEffect(() => {
    if (soundPlayedRef.current) return;
    soundPlayedRef.current = true;
    const timer = setTimeout(() => playGameOver(), 300);
    return () => clearTimeout(timer);
  }, []);

  const activePlayers = players.filter((p) => !p.isSpectator);
  const maxPossible = (activePlayers.length - 1) * 4 * activePlayers.length;
  const percentage =
    maxPossible > 0 ? Math.round((game.teamScore / maxPossible) * 100) : 0;

  function getVerdict() {
    if (percentage >= 80) return "Perfectly Aligned! 🎯";
    if (percentage >= 60) return "Great Wavelength! ✨";
    if (percentage >= 40) return "Getting There! 🌊";
    if (percentage >= 20) return "Room to Grow 🌱";
    return "Out of Sync 😅";
  }

  return (
    <div className="space-y-6 pt-8 text-center">
      <Confetti />

      {/* Trophy */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
      >
        <Trophy className="mx-auto h-16 w-16 text-gold" />
      </motion.div>

      {/* Final Score */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <h1 className="text-5xl font-bold text-primary tabular-nums">
          {game.teamScore}
        </h1>
        <p className="mt-1 text-lg text-text-secondary">
          out of {maxPossible} possible points
        </p>
        <p className="mt-2 text-2xl font-semibold">{getVerdict()}</p>
      </motion.div>

      {/* Player Scores */}
      {playerScores && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="glass-card rounded-2xl p-5 shadow-sm"
        >
          <h3 className="mb-3 text-sm font-medium uppercase tracking-wider text-text-secondary">
            Player Scores
          </h3>
          <div className="space-y-2">
            {[...activePlayers]
              .sort((a, b) => (playerScores[b._id] ?? 0) - (playerScores[a._id] ?? 0))
              .map((player, i) => {
                const score = playerScores[player._id] ?? 0;
                return (
                  <div
                    key={player._id}
                    className="flex items-center gap-3 rounded-lg bg-cream px-3 py-2 text-sm"
                  >
                    <span className="font-mono text-xs text-text-secondary">
                      {i + 1}
                    </span>
                    <div
                      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: player.color }}
                    >
                      {player.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="flex-1 text-left font-medium">
                      {player.name}
                    </span>
                    <span className="font-bold tabular-nums" style={{ color: player.color }}>
                      {score} pts
                    </span>
                  </div>
                );
              })}
          </div>
        </motion.div>
      )}

      {/* Round Recap */}
      {rounds && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="glass-card rounded-2xl p-5 shadow-sm"
        >
          <h3 className="mb-3 text-sm font-medium uppercase tracking-wider text-text-secondary">
            Round Recap
          </h3>
          <div className="space-y-2">
            {rounds
              .filter((r) => r.clue)
              .sort((a, b) => a.roundIndex - b.roundIndex)
              .map((r, i) => {
                const giver = players.find((p) => p._id === r.clueGiverId);
                return (
                  <div
                    key={r._id}
                    className="flex items-center gap-3 rounded-lg bg-cream px-3 py-2 text-left text-sm"
                  >
                    <span className="font-mono text-xs text-text-secondary">
                      {i + 1}
                    </span>
                    <div
                      className="h-5 w-5 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: giver?.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <span className="font-medium">{r.clue}</span>
                      <span className="ml-2 text-xs text-text-secondary">
                        {r.spectrumLeft} ↔ {r.spectrumRight}
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>
        </motion.div>
      )}

      {/* Spectator banner */}
      {myPlayer?.isSpectator && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.0 }}
          className="rounded-xl bg-accent/10 px-4 py-3 text-sm font-medium text-accent"
        >
          You&apos;ll join as a player next game!
        </motion.p>
      )}

      {/* Actions */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
        className="space-y-3"
      >
        {isHost && (
          <button
            onClick={() => playAgain({ gameId: game._id, sessionId })}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-4 text-lg font-semibold text-white transition-all hover:brightness-110 active:scale-[0.98]"
          >
            <RotateCcw className="h-5 w-5" />
            Play Again
          </button>
        )}
        <Link
          href="/"
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-gray-200 px-6 py-3 font-medium text-text-secondary transition-all hover:bg-gray-50"
        >
          <Home className="h-4 w-4" />
          Back to Home
        </Link>
      </motion.div>
    </div>
  );
}
