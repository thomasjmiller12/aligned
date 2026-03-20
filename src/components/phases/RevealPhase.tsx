"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc } from "../../../convex/_generated/dataModel";
import SpectrumDial from "../SpectrumDial";
import { calculateScore, getScoreLabel, getScoreColor } from "@/lib/scoring";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useState } from "react";

interface RevealPhaseProps {
  game: Doc<"games">;
  round: Doc<"rounds">;
  players: Doc<"players">[];
  isHost: boolean;
  sessionId: string;
}

export default function RevealPhase({
  game,
  round,
  players,
  isHost,
  sessionId,
}: RevealPhaseProps) {
  const guesses = useQuery(api.games.getGuesses, { roundId: round._id });
  const nextRound = useMutation(api.games.nextRound);
  const [advancing, setAdvancing] = useState(false);

  const clueGiver = players.find((p) => p._id === round.clueGiverId);

  const playerArrows = (guesses ?? []).map((g) => {
    const player = players.find((p) => p._id === g.playerId);
    return {
      id: g._id,
      color: player?.color ?? "#999",
      initial: player?.name.charAt(0).toUpperCase() ?? "?",
      position: g.position,
      lockedIn: true,
    };
  });

  // Calculate scores for display
  const scoreBreakdown = (guesses ?? []).map((g) => {
    const player = players.find((p) => p._id === g.playerId);
    const score = calculateScore(g.position, round.targetPosition);
    return {
      name: player?.name ?? "?",
      color: player?.color ?? "#999",
      score,
      label: getScoreLabel(score),
      scoreColor: getScoreColor(score),
    };
  });

  const roundTotal = scoreBreakdown.reduce((sum, s) => sum + s.score, 0);

  return (
    <div className="space-y-2 text-center">
      {/* Clue reminder */}
      <div>
        <p className="text-sm text-text-secondary">
          {clueGiver?.name}&apos;s clue:
        </p>
        <h2 className="text-2xl font-bold text-primary">
          {round.clue || "..."}
        </h2>
      </div>

      {/* Dial with reveal */}
      <SpectrumDial
        leftLabel={round.spectrumLeft}
        rightLabel={round.spectrumRight}
        targetPosition={round.targetPosition}
        showScoringWedge={true}
        playerArrows={playerArrows}
      />

      {/* Score Breakdown */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="glass-card rounded-2xl p-5 shadow-sm"
      >
        <h3 className="mb-3 text-sm font-medium uppercase tracking-wider text-text-secondary">
          Round Scores
        </h3>
        <div className="space-y-2">
          {scoreBreakdown.map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6 + i * 0.1 }}
              className="flex items-center justify-between rounded-lg bg-cream px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <div
                  className="h-6 w-6 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span className="font-medium">{s.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="text-xs font-medium"
                  style={{ color: s.scoreColor }}
                >
                  {s.label}
                </span>
                <span
                  className="text-lg font-bold"
                  style={{ color: s.scoreColor }}
                >
                  +{s.score}
                </span>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.0 }}
          className="mt-3 border-t pt-3 text-right"
        >
          <span className="text-sm text-text-secondary">Round total: </span>
          <span className="text-xl font-bold text-primary">+{roundTotal}</span>
        </motion.div>
      </motion.div>

      {/* Next button */}
      {isHost ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
        >
          <button
            onClick={async () => {
              if (advancing) return;
              setAdvancing(true);
              try {
                await nextRound({ gameId: game._id, sessionId });
              } catch {
                setAdvancing(false);
              }
            }}
            disabled={advancing}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-4 text-lg font-semibold text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
          >
            {advancing ? "Loading..." : "Next Round"}
            {!advancing && <ArrowRight className="h-5 w-5" />}
          </button>
        </motion.div>
      ) : (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="text-sm text-text-secondary"
        >
          Waiting for host to continue...
        </motion.p>
      )}
    </div>
  );
}
