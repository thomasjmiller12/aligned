"use client";

import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { getSessionId } from "@/lib/session";
import { Id } from "../../../../convex/_generated/dataModel";
import { useCallback, useEffect, useRef, useState } from "react";
import { playPhaseTransition } from "@/lib/sounds";
import GameHeader from "@/components/GameHeader";
import PlayerBar from "@/components/PlayerBar";
import LobbyPhase from "@/components/phases/LobbyPhase";
import CluePhase from "@/components/phases/CluePhase";
import GuessingPhase from "@/components/phases/GuessingPhase";
import RevealPhase from "@/components/phases/RevealPhase";
import GameOverPhase from "@/components/phases/GameOverPhase";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import FluidBackground from "@/components/FluidBackground";
import ChatPanel from "@/components/ChatPanel";
import { Button } from "@/components/ui/Button";
import EmojiReactions from "@/components/EmojiReactions";

export default function GamePage() {
  const params = useParams();
  const code = (params.code as string).toUpperCase();
  const [sessionId, setSessionId] = useState("");

  useEffect(() => {
    setSessionId(getSessionId());
  }, []);

  const game = useQuery(api.games.getGameByCode, { code });
  const players = useQuery(
    api.games.getPlayers,
    game ? { gameId: game._id } : "skip"
  );
  const currentRound = useQuery(
    api.games.getCurrentRound,
    game && sessionId ? { gameId: game._id, sessionId } : "skip"
  );
  const myPlayer = useQuery(
    api.games.getMyPlayer,
    game && sessionId ? { gameId: game._id, sessionId } : "skip"
  );
  const playerScores = useQuery(
    api.games.getPlayerScores,
    game && game.status !== "lobby" ? { gameId: game._id } : "skip"
  );

  const updatePresence = useMutation(api.presence.updatePresence);
  const presenceData = useQuery(
    api.presence.getPresence,
    game ? { gameId: game._id } : "skip"
  );

  // Dial drag position ref — read by FluidBackground each frame (no re-renders)
  const dialDragPosRef = useRef<{ x: number; y: number } | null>(null);
  const getDialDragPos = useCallback(() => dialDragPosRef.current, []);

  const handleLocalMove = useCallback(
    (x: number, y: number) => {
      if (!game || !myPlayer) return;
      updatePresence({
        gameId: game._id,
        playerId: myPlayer._id,
        x,
        y,
        color: myPlayer.color,
      });
    },
    [game, myPlayer, updatePresence]
  );

  const handleLocalBurst = useCallback(
    (x: number, y: number, burstSeed: number) => {
      if (!game || !myPlayer) return;
      updatePresence({
        gameId: game._id,
        playerId: myPlayer._id,
        x,
        y,
        color: myPlayer.color,
        burst: true,
        burstSeed,
      });
    },
    [game, myPlayer, updatePresence]
  );

  const handleDialDragMove = useCallback(
    (clientX: number, clientY: number) => {
      dialDragPosRef.current = { x: clientX, y: clientY };
    },
    []
  );

  const handleDialDragEnd = useCallback(() => {
    dialDragPosRef.current = null;
  }, []);

  // Play sound on phase transitions
  const prevStatusRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!game) return;
    if (prevStatusRef.current && prevStatusRef.current !== game.status) {
      playPhaseTransition();
    }
    prevStatusRef.current = game.status;
  }, [game?.status]);

  const remotePresence = (presenceData ?? [])
    .filter((r) => myPlayer && r.playerId !== myPlayer._id)
    .map((r) => ({
      playerId: r.playerId,
      x: r.x,
      y: r.y,
      color: r.color,
      burstAt: r.burstAt,
      burstSeed: r.burstSeed,
    }));

  if (game === undefined || players === undefined) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <div className="lit font-title text-3xl font-light uppercase tracking-[0.18em] text-foam">
          Aligned
        </div>
        <div className="h-px w-24 animate-pulse bg-caustic/40" />
      </div>
    );
  }

  if (game === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="font-title text-2xl font-semibold text-foam">
            Game not found
          </h1>
          <p className="mt-2 text-silt">Check the code and try again</p>
          <Link
            href="/"
            className="mt-4 inline-block text-caustic hover:underline"
          >
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  const isHost = game.hostId === sessionId;
  const totalRounds = players?.length ?? 0;

  // Show join form if visitor isn't in the game yet
  if (myPlayer === null && sessionId) {
    return (
      <JoinInlineForm
        code={code}
        sessionId={sessionId}
        isSpectating={game.status !== "lobby"}
      />
    );
  }

  return (
    <>
    <FluidBackground
      remotePresence={remotePresence}
      onLocalMove={handleLocalMove}
      onLocalBurst={handleLocalBurst}
      playerColor={myPlayer?.color ?? "#E8553A"}
      interactive={!!myPlayer}
      getExternalPointerPos={getDialDragPos}
    />
    {game && sessionId && myPlayer && (
      <ChatPanel
        gameId={game._id}
        sessionId={sessionId}
        myPlayerId={myPlayer._id}
      />
    )}
    {game && sessionId && myPlayer && game.status !== "lobby" && game.status !== "game_over" && (
      <EmojiReactions gameId={game._id} sessionId={sessionId} />
    )}
    <div className="flex min-h-screen flex-col">
      <GameHeader
        code={game.code}
        teamScore={game.teamScore}
        currentRound={game.currentRound}
        totalRounds={totalRounds}
        status={game.status}
      />

      {players && (
        <PlayerBar
          players={players}
          currentRound={currentRound}
          sessionId={sessionId}
          playerScores={playerScores}
          showScores={game.status !== "lobby"}
        />
      )}


      <main className="flex flex-1 flex-col items-center px-4 pb-8">
        <AnimatePresence mode="popLayout">
          {game.status === "lobby" && (
            <motion.div
              key="lobby"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-lg"
            >
              <LobbyPhase
                game={game}
                players={players ?? []}
                isHost={isHost}
                sessionId={sessionId}
              />
            </motion.div>
          )}

          {game.status === "clue_phase" && (
            <motion.div
              key="clue"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-lg"
            >
              <CluePhase
                game={game}
                players={players ?? []}
                myPlayer={myPlayer ?? null}
                sessionId={sessionId}
                isHost={isHost}
              />
            </motion.div>
          )}

          {game.status === "guessing" && currentRound && (
            <motion.div
              key={`guessing-${game.currentRound}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-lg"
            >
              <GuessingPhase
                game={game}
                round={currentRound}
                players={players ?? []}
                myPlayer={myPlayer ?? null}
                sessionId={sessionId}
                onDragMove={handleDialDragMove}
                onDragEnd={handleDialDragEnd}
              />
            </motion.div>
          )}

          {game.status === "revealing" && currentRound && (
            <motion.div
              key={`revealing-${game.currentRound}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="w-full max-w-lg"
            >
              <RevealPhase
                game={game}
                round={currentRound}
                players={players ?? []}
                isHost={isHost}
                sessionId={sessionId}
              />
            </motion.div>
          )}

          {game.status === "game_over" && (
            <motion.div
              key="gameover"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="w-full max-w-lg"
            >
              <GameOverPhase
                game={game}
                players={players ?? []}
                isHost={isHost}
                sessionId={sessionId}
                playerScores={playerScores}
                myPlayer={myPlayer ?? null}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
    </>
  );
}

function JoinInlineForm({
  code,
  sessionId,
  isSpectating = false,
}: {
  code: string;
  sessionId: string;
  isSpectating?: boolean;
}) {
  const joinGame = useMutation(api.games.joinGame);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleJoin() {
    if (!name.trim()) return setError("Enter your name");
    setLoading(true);
    setError("");
    try {
      await joinGame({
        code,
        playerName: name.trim(),
        sessionId,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to join");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="lit font-title text-4xl font-light uppercase tracking-[0.18em] text-foam">
            Aligned
          </h1>
          <p className="mt-3 text-silt">
            {isSpectating ? (
              <>
                Game{" "}
                <span className="font-title tracking-[0.3em] text-caustic">
                  {code}
                </span>{" "}
                is in progress
              </>
            ) : (
              <>
                Join game{" "}
                <span className="font-title tracking-[0.3em] text-caustic">
                  {code}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="panel-lit space-y-4 rounded-2xl p-6">
          <input
            type="text"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            autoFocus
            className="w-full rounded-xl border border-caustic/20 bg-abyss/40 px-4 py-3 text-lg text-foam outline-none transition-all placeholder:text-silt/60 focus:border-caustic/60 focus:ring-2 focus:ring-caustic/25"
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button onClick={handleJoin} disabled={loading} fullWidth>
            {loading
              ? "Joining..."
              : isSpectating
                ? "Join as spectator"
                : "Join game"}
          </Button>
          {isSpectating && (
            <p className="text-center text-xs text-silt">
              You&apos;ll watch this round, then join the next game
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

