"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc } from "../../../convex/_generated/dataModel";
import SpectrumDial from "../SpectrumDial";
import { calculateScore, getScoreLabel, getScoreColor } from "@/lib/scoring";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { playScoreReveal } from "@/lib/sounds";
import { Button } from "@/components/ui/Button";

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

  // Play score sound once on reveal, synced with scoring wedge animation
  const soundPlayedRef = useRef(false);
  useEffect(() => {
    if (soundPlayedRef.current || scoreBreakdown.length === 0) return;
    soundPlayedRef.current = true;
    const bestScore = Math.max(...scoreBreakdown.map((s) => s.score));
    const timer = setTimeout(() => playScoreReveal(bestScore), 500);
    return () => clearTimeout(timer);
  }, [scoreBreakdown]);

  return (
    <div className="space-y-2 text-center">
      {/* Clue reminder */}
      <div>
        <p className="text-sm text-silt">
          {clueGiver?.name}&apos;s clue:
        </p>
        <h2 className="mt-1 font-title text-2xl font-semibold text-foam">
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
        className="panel rounded-2xl p-5"
      >
        <h3 className="mb-3 text-sm font-medium uppercase tracking-wider text-silt">
          Round Scores
        </h3>
        <div className="space-y-2">
          {scoreBreakdown.map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6 + i * 0.1 }}
              className="flex items-center justify-between rounded-xl bg-foam/5 px-3 py-2 tabular-nums"
            >
              <div className="flex items-center gap-2">
                <div
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span className="font-medium text-foam">{s.name}</span>
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
        >
          <div className="rule-caustic mt-3" />
          <div className="pt-3 text-right">
            <span className="text-sm text-silt">Round total: </span>
            <span className="lit-warm font-title text-3xl font-semibold text-sun tabular-nums">
              +{roundTotal}
            </span>
          </div>
        </motion.div>
      </motion.div>

      {/* Next button */}
      {isHost ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
        >
          <Button
            variant="primary"
            size="lg"
            fullWidth
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
          >
            {advancing ? "Loading..." : "Next Round"}
            {!advancing && <ArrowRight className="h-5 w-5" />}
          </Button>
        </motion.div>
      ) : (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="text-sm text-silt"
        >
          Waiting for host to continue...
        </motion.p>
      )}
    </div>
  );
}
