"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc } from "../../../convex/_generated/dataModel";
import { useState } from "react";
import Timer from "../Timer";
import SpectrumDial from "../SpectrumDial";
import { motion } from "framer-motion";
import { Check, Clock } from "lucide-react";
import { playClueSubmitted } from "@/lib/sounds";
import { Button } from "@/components/ui/Button";

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
  const [editing, setEditing] = useState(false);

  if (!rounds || !myPlayer) return null;

  // Find my round (where I'm the clue giver)
  const myRound = rounds.find((r) => r.clueGiverId === myPlayer._id);
  const hasSubmittedClue = submitted || !!myRound?.clue;
  const showClueInput = !hasSubmittedClue || editing;

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
      setEditing(false);
      playClueSubmitted();
    } finally {
      setSubmitting(false);
    }
  }

  function handleEditClue() {
    setClueText(myRound?.clue ?? clueText);
    setEditing(true);
  }

  // Count how many players have submitted clues. Compare against the number of
  // rounds, not players: anyone who joined after the game started is a
  // spectator with no round of their own, and comparing to players.length meant
  // allSubmitted could never go true, so the room was stuck waiting out the
  // full clue timer.
  const submittedCount = rounds.filter(
    (r) => r.clue || r.status === "clue_given"
  ).length;
  const allSubmitted = rounds.length > 0 && submittedCount === rounds.length;
  const waitingOn = players.filter((p) => {
    const pRound = rounds.find((r) => r.clueGiverId === p._id);
    return pRound && !pRound.clue && pRound.status !== "clue_given";
  });

  return (
    <div className="space-y-2 text-center">
      <Timer
        endsAt={game.timerEndsAt}
        totalSeconds={game.settings.clueTimerSeconds}
      />

      <h2 className="font-title text-xl font-bold text-sun">Give Your Clue</h2>
      <p className="text-sm text-silt">
        Everyone writes a clue for their spectrum at the same time
      </p>

      {myRound && (
        <div className="space-y-4">
          <SpectrumDial
            leftLabel={myRound.spectrumLeft}
            rightLabel={myRound.spectrumRight}
            targetPosition={myRound.targetPosition}
          />

          {showClueInput ? (
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Type your clue..."
                value={clueText}
                onChange={(e) => setClueText(e.target.value)}
                maxLength={250}
                autoFocus
                className="w-full rounded-xl border border-caustic/25 bg-abyss/50 px-6 py-5 text-center text-2xl font-semibold text-foam outline-none placeholder:text-silt/70 transition-colors focus:border-caustic focus:ring-2 focus:ring-caustic/40"
                onKeyDown={(e) => e.key === "Enter" && handleSubmitClue()}
              />
              <Button
                variant="primary"
                size="lg"
                fullWidth
                onClick={handleSubmitClue}
                disabled={!clueText.trim() || submitting}
              >
                {submitting
                  ? "Submitting..."
                  : editing
                    ? "Update Clue"
                    : "Submit Clue"}
              </Button>
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
              <button
                onClick={handleEditClue}
                className="mt-2 text-sm text-success underline underline-offset-2 transition-colors hover:text-success/80"
              >
                Edit clue
              </button>
            </motion.div>
          )}
        </div>
      )}

      {/* Status of other players */}
      <div className="panel rounded-2xl p-4">
        <div className="mb-2 text-sm font-medium text-silt">
          {submittedCount} / {rounds.length} clues submitted
        </div>
        <div className="flex justify-center gap-2">
          {players.map((p) => {
            const pRound = rounds.find((r) => r.clueGiverId === p._id);
            const hasClue = pRound?.clue || pRound?.status === "clue_given";
            return (
              <div
                key={p._id}
                className={[
                  "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold",
                  hasClue ? "text-white" : "bg-shoal/60",
                ].join(" ")}
                style={hasClue ? { backgroundColor: p.color } : undefined}
              >
                {hasClue ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Clock className="h-4 w-4 text-silt" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Host can advance early when all submitted */}
      {isHost && allSubmitted && (
        <Button
          variant="primary"
          size="lg"
          fullWidth
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
        >
          {advancing
            ? "Starting..."
            : "Everyone’s ready — Start Guessing!"}
        </Button>
      )}
    </div>
  );
}
