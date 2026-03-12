"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc } from "../../../convex/_generated/dataModel";
import { useCallback, useEffect, useRef, useState } from "react";
import Timer from "../Timer";
import SpectrumDial from "../SpectrumDial";
import { Lock, Eye } from "lucide-react";


interface GuessingPhaseProps {
  game: Doc<"games">;
  round: Doc<"rounds">;
  players: Doc<"players">[];
  myPlayer: Doc<"players"> | null;
  sessionId: string;
  onDragMove?: (clientX: number, clientY: number) => void;
  onDragEnd?: () => void;
}

export default function GuessingPhase({
  game,
  round,
  players,
  myPlayer,
  sessionId,
  onDragMove,
  onDragEnd,
}: GuessingPhaseProps) {
  const guesses = useQuery(api.games.getGuesses, { roundId: round._id });
  const submitGuess = useMutation(api.games.submitGuess);
  const lockGuessMutation = useMutation(api.games.lockGuess);
  const revealRound = useMutation(api.games.revealRound);

  const [myPosition, setMyPosition] = useState(90);
  const [isLocked, setIsLocked] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastSentRef = useRef<number>(-1);

  const isClueGiver = myPlayer?._id === round.clueGiverId;
  const isHost = game.hostId === sessionId;
  const isPlayer = myPlayer !== null;
  const canGuess = isPlayer && !isClueGiver;
  const clueGiver = players.find((p) => p._id === round.clueGiverId);

  // Restore position from server on reconnect, or submit initial position
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current || !guesses || !myPlayer || !canGuess) return;

    const myServerGuess = guesses.find((g) => g.playerId === myPlayer._id);
    if (myServerGuess) {
      // Reconnecting — restore from server
      setMyPosition(myServerGuess.position);
      if (myServerGuess.lockedIn) setIsLocked(true);
      initializedRef.current = true;
    } else if (guesses !== undefined) {
      // First time — submit initial position so guess doc exists
      submitGuess({ roundId: round._id, sessionId, position: 90 });
      initializedRef.current = true;
    }
  }, [guesses, myPlayer, canGuess, round._id, sessionId, submitGuess]);

  const handlePositionChange = useCallback(
    (position: number) => {
      setMyPosition(position);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (lastSentRef.current !== position) {
          lastSentRef.current = position;
          submitGuess({ roundId: round._id, sessionId, position });
        }
      }, 150);
    },
    [round._id, sessionId, submitGuess]
  );

  const [lockPending, setLockPending] = useState(false);
  const [revealPending, setRevealPending] = useState(false);

  async function handleLockIn() {
    if (lockPending) return;
    setLockPending(true);
    try {
      await lockGuessMutation({ roundId: round._id, sessionId });
      setIsLocked(true);
    } finally {
      setLockPending(false);
    }
  }

  async function handleReveal() {
    if (revealPending) return;
    setRevealPending(true);
    try {
      await revealRound({ gameId: game._id, sessionId });
    } catch {
      setRevealPending(false);
    }
  }

  // Build player arrows from guesses
  const playerArrows = (guesses ?? [])
    .filter((g) => g.playerId !== myPlayer?._id)
    .map((g) => {
      const player = players.find((p) => p._id === g.playerId);
      return {
        id: g._id,
        color: player?.color ?? "#999",
        initial: player?.name.charAt(0).toUpperCase() ?? "?",
        position: g.position,
        lockedIn: g.lockedIn,
      };
    });

  // Check my lock status from server
  const myGuess = (guesses ?? []).find((g) => g.playerId === myPlayer?._id);
  const effectiveLocked = isLocked || (myGuess?.lockedIn ?? false);

  const guessCount = (guesses ?? []).length;
  const lockedCount = (guesses ?? []).filter((g) => g.lockedIn).length;
  const totalGuessers = players.length - 1; // exclude clue giver
  // All locked when every guesser has a guess AND all are locked
  const allLockedIn =
    guessCount >= totalGuessers &&
    lockedCount >= totalGuessers &&
    totalGuessers > 0;

  return (
    <div className="space-y-3 pt-1 text-center">
      <Timer
        endsAt={game.timerEndsAt}
        totalSeconds={game.settings.guessTimerSeconds}
      />

      {/* Clue Display */}
      <div>
        <p className="text-sm text-text-secondary">
          {clueGiver?.name}&apos;s clue:
        </p>
        <h2 className="text-3xl font-bold text-primary">
          {round.clue || "..."}
        </h2>
      </div>

      {/* Dial */}
      <SpectrumDial
        leftLabel={round.spectrumLeft}
        rightLabel={round.spectrumRight}
        targetPosition={isClueGiver ? round.targetPosition : undefined}
        interactive={canGuess}
        myPosition={canGuess ? myPosition : undefined}
        onPositionChange={canGuess ? handlePositionChange : undefined}
        playerArrows={playerArrows}
        lockedIn={effectiveLocked}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
      />

      {/* Lock In / Watching */}
      {!isPlayer ? (
        <div className="flex items-center justify-center gap-2 rounded-xl bg-gray-100 px-4 py-3 text-text-secondary">
          <Eye className="h-5 w-5" />
          <span className="font-medium">Spectating</span>
        </div>
      ) : isClueGiver ? (
        <div className="flex items-center justify-center gap-2 rounded-xl bg-secondary/10 px-4 py-3 text-secondary">
          <Eye className="h-5 w-5" />
          <span className="font-medium">
            You&apos;re the clue giver — watch and hope!
          </span>
        </div>
      ) : effectiveLocked ? (
        <div className="flex items-center justify-center gap-2 rounded-xl bg-success/10 px-4 py-3 text-success">
          <Lock className="h-5 w-5" />
          <span className="font-medium">Locked in!</span>
        </div>
      ) : (
        <button
          onClick={handleLockIn}
          disabled={lockPending}
          className="w-full rounded-xl bg-accent px-6 py-4 text-lg font-semibold text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
        >
          <Lock className="mr-2 inline h-5 w-5" />
          {lockPending ? "Locking..." : "Lock In"}
        </button>
      )}

      {/* Status */}
      <p className="text-sm text-text-secondary">
        {lockedCount} / {totalGuessers} locked in
      </p>

      {/* Host can reveal early before everyone locks in */}
      {isHost && !allLockedIn && (
        <button
          onClick={handleReveal}
          disabled={revealPending}
          className="text-sm text-text-secondary underline hover:text-text disabled:opacity-50"
        >
          Reveal early (skip remaining)
        </button>
      )}
    </div>
  );
}
