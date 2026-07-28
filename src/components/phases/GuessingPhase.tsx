"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc } from "../../../convex/_generated/dataModel";
import { useCallback, useEffect, useRef, useState } from "react";
import Timer from "../Timer";
import SpectrumDial from "../SpectrumDial";
import { Lock, LockOpen, Eye } from "lucide-react";
import { playLockIn } from "@/lib/sounds";
import { Button } from "@/components/ui/Button";


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
  const unlockGuessMutation = useMutation(api.games.unlockGuess);
  const revealRound = useMutation(api.games.revealRound);

  const [myPosition, setMyPosition] = useState(90);
  const [isLocked, setIsLocked] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastSentRef = useRef<number>(-1);

  const isClueGiver = myPlayer?._id === round.clueGiverId;
  const isHost = game.hostId === sessionId;
  const isPlayer = myPlayer !== null;
  const canGuess = isPlayer && !isClueGiver && !myPlayer?.isSpectator;
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
  const [unlockPending, setUnlockPending] = useState(false);
  const [revealPending, setRevealPending] = useState(false);
  const [revealArmed, setRevealArmed] = useState(false);
  const revealArmedTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  async function handleLockIn() {
    if (lockPending) return;
    setLockPending(true);
    try {
      await lockGuessMutation({ roundId: round._id, sessionId });
      setIsLocked(true);
      playLockIn();
    } finally {
      setLockPending(false);
    }
  }

  async function handleUnlock() {
    if (unlockPending) return;
    setUnlockPending(true);
    try {
      await unlockGuessMutation({ roundId: round._id, sessionId });
      setIsLocked(false);
    } catch {
      // Round may have already been revealed — UI will reflect that on next query
    } finally {
      setUnlockPending(false);
    }
  }

  async function handleReveal() {
    if (revealPending) return;
    if (!allLockedIn && !revealArmed) {
      setRevealArmed(true);
      if (revealArmedTimeoutRef.current) clearTimeout(revealArmedTimeoutRef.current);
      revealArmedTimeoutRef.current = setTimeout(() => setRevealArmed(false), 3000);
      return;
    }
    if (revealArmedTimeoutRef.current) clearTimeout(revealArmedTimeoutRef.current);
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
  const totalGuessers = players.filter((p) => !p.isSpectator).length - 1; // exclude clue giver and spectators
  // All locked when every guesser has a guess AND all are locked
  const allLockedIn =
    guessCount >= totalGuessers &&
    lockedCount >= totalGuessers &&
    totalGuessers > 0;

  return (
    <div className="space-y-2 text-center">
      <Timer
        endsAt={game.timerEndsAt}
        totalSeconds={game.settings.guessTimerSeconds}
      />

      {/* Clue Display */}
      <div className="px-2">
        <p className="text-sm text-silt">
          {clueGiver?.name}&apos;s clue:
        </p>
        <h2 className="lit mt-1 font-title text-4xl font-semibold leading-snug tracking-wide text-foam">
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
        myColor={myPlayer?.color}
        onPositionChange={canGuess ? handlePositionChange : undefined}
        playerArrows={playerArrows}
        lockedIn={effectiveLocked}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
      />

      {/* Lock In / Watching */}
      {!isPlayer ? (
        <div className="panel flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-silt">
          <Eye className="h-5 w-5" />
          <span className="font-medium">Spectating</span>
        </div>
      ) : isClueGiver ? (
        <div className="panel flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-caustic">
          <Eye className="h-5 w-5" />
          <span className="font-medium">
            You&apos;re the clue giver — watch and hope!
          </span>
        </div>
      ) : effectiveLocked ? (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-success/10 px-4 py-3 text-success">
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            <span className="font-medium">Locked in!</span>
          </div>
          <Button
            variant="ghost"
            size="md"
            onClick={handleUnlock}
            disabled={unlockPending}
          >
            <LockOpen className="h-4 w-4" />
            {unlockPending ? "Unlocking..." : "Unlock to change"}
          </Button>
        </div>
      ) : (
        <Button
          variant="primary"
          size="lg"
          fullWidth
          onClick={handleLockIn}
          disabled={lockPending}
        >
          <Lock className="h-5 w-5" />
          {lockPending ? "Locking..." : "Lock In"}
        </Button>
      )}

      {/* Status */}
      <p className="text-xs tabular-nums text-silt">
        {lockedCount} / {totalGuessers} locked in
      </p>

      {/* Host can reveal early before everyone locks in */}
      {isHost && !allLockedIn && (
        <Button
          variant="secondary"
          size="md"
          onClick={handleReveal}
          disabled={revealPending}
        >
          {revealPending
            ? "Revealing..."
            : revealArmed
              ? "Confirm — reveal early?"
              : "Reveal early (skip remaining)"}
        </Button>
      )}
    </div>
  );
}
