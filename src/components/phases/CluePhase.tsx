"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc } from "../../../convex/_generated/dataModel";
import { useState } from "react";
import Timer from "../Timer";
import SpectrumDial from "../SpectrumDial";
import { motion } from "framer-motion";
import { Check, Clock } from "lucide-react";

interface CluePhaseProps {
  game: Doc<"games">;
  players: Doc<"players">[];
  myPlayer: Doc<"players"> | null;
  sessionId: string;
  isHost: boolean;
}

export default function CluePhase({
  game,
  players,
  myPlayer,
  sessionId,
  isHost,
}: CluePhaseProps) {
  const rounds = useQuery(api.games.getRounds, {
    gameId: game._id,
    sessionId,
  });
  const submitClue = useMutation(api.games.submitClue);
  const advanceToGuessing = useMutation(api.games.advanceToGuessing);
  const [clueText, setClueText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [advancing, setAdvancing] = useState(false);

  if (!rounds || !myPlayer) return null;

  // Find my round (where I'm the clue giver)
  const myRound = rounds.find((r) => r.clueGiverId === myPlayer._id);

  async function handleSubmitClue() {
    if (!myRound || !clueText.trim() || submitting) return;
    setSubmitting(true);
    try {
      await submitClue({
        roundId: myRound._id,
        sessionId,
        clue: clueText.trim(),
      });
      setSubmitted(true);
    } catch {
      setSubmitting(false);
    }
  }

  // Count how many players have submitted clues
  const submittedCount = rounds.filter(
    (r) => r.clue || r.status === "clue_given"
  ).length;
  const allSubmitted = submittedCount === players.length;

  return (
    <div className="space-y-2 text-center">
      <Timer
        endsAt={game.timerEndsAt}
        totalSeconds={game.settings.clueTimerSeconds}
      />

      <h2 className="text-xl font-bold">Give Your Clue</h2>
      <p className="text-sm text-text-secondary">
        Everyone writes a clue for their spectrum at the same time
      </p>

      {myRound && (
        <div className="space-y-4">
          <SpectrumDial
            leftLabel={myRound.spectrumLeft}
            rightLabel={myRound.spectrumRight}
            targetPosition={myRound.targetPosition}
          />

          {!submitted && !myRound.clue ? (
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Type your clue..."
                value={clueText}
                onChange={(e) => setClueText(e.target.value)}
                maxLength={50}
                autoFocus
                className="w-full rounded-xl border-2 border-gray-200 bg-white/50 px-4 py-3 text-center text-xl font-semibold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                onKeyDown={(e) => e.key === "Enter" && handleSubmitClue()}
              />
              <button
                onClick={handleSubmitClue}
                disabled={!clueText.trim() || submitting}
                className="w-full rounded-xl bg-primary px-6 py-3 text-lg font-semibold text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
              >
                {submitting ? "Submitting..." : "Submit Clue"}
              </button>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-xl bg-success/10 px-4 py-3 text-success"
            >
              <Check className="mx-auto mb-1 h-6 w-6" />
              <p className="font-semibold">
                Clue submitted: &quot;{myRound.clue || clueText}&quot;
              </p>
            </motion.div>
          )}
        </div>
      )}

      {/* Status of other players */}
      <div className="glass-card rounded-xl p-4 shadow-sm">
        <div className="mb-2 text-sm font-medium text-text-secondary">
          {submittedCount} / {players.length} clues submitted
        </div>
        <div className="flex justify-center gap-2">
          {players.map((p) => {
            const pRound = rounds.find((r) => r.clueGiverId === p._id);
            const hasClue = pRound?.clue || pRound?.status === "clue_given";
            return (
              <div
                key={p._id}
                className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{
                  backgroundColor: hasClue ? p.color : "#E5E5E5",
                }}
              >
                {hasClue ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Clock className="h-4 w-4 text-text-secondary" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Host can advance early when all submitted */}
      {isHost && allSubmitted && (
        <button
          onClick={async () => {
            if (advancing) return;
            setAdvancing(true);
            try {
              await advanceToGuessing({ gameId: game._id, sessionId });
            } catch {
              setAdvancing(false);
            }
          }}
          disabled={advancing}
          className="w-full rounded-xl bg-accent px-6 py-3 text-lg font-semibold text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
        >
          {advancing
            ? "Starting..."
            : "Everyone\u2019s ready \u2014 Start Guessing!"}
        </button>
      )}
    </div>
  );
}
