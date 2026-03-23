"use client";

import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc } from "../../../convex/_generated/dataModel";
import { Check, Users, Share2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { playPlayerJoined } from "@/lib/sounds";

interface LobbyPhaseProps {
  game: Doc<"games">;
  players: Doc<"players">[];
  isHost: boolean;
  sessionId: string;
}

export default function LobbyPhase({
  game,
  players,
  isHost,
  sessionId,
}: LobbyPhaseProps) {
  const startGame = useMutation(api.games.startGame);
  const kickPlayer = useMutation(api.games.kickPlayer);
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const prevPlayerCountRef = useRef(players.length);

  useEffect(() => {
    if (players.length > prevPlayerCountRef.current) {
      playPlayerJoined();
    }
    prevPlayerCountRef.current = players.length;
  }, [players.length]);

  async function shareOrCopy() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join my Aligned game!",
          text: `Join with code ${game.code}`,
          url,
        });
        return;
      } catch {
        // User cancelled or share failed — fall through to copy
      }
    }
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleStart() {
    setStarting(true);
    try {
      await startGame({ gameId: game._id, sessionId });
    } catch {
      setStarting(false);
    }
  }

  return (
    <div className="space-y-6 pt-8 text-center">
      {/* Share Code */}
      <div>
        <p className="mb-2 text-sm font-medium uppercase tracking-wider text-text-secondary">
          Share this code
        </p>
        <button
          onClick={shareOrCopy}
          className="inline-flex items-center gap-3 rounded-2xl bg-white/70 backdrop-blur-sm border border-white/50 px-8 py-4 text-4xl font-bold tracking-[0.4em] shadow-lg transition-all hover:shadow-xl active:scale-[0.98]"
        >
          {game.code}
          {copied ? (
            <Check className="h-6 w-6 text-success" />
          ) : (
            <Share2 className="h-6 w-6 text-text-secondary" />
          )}
        </button>
      </div>

      {/* Players List */}
      <div className="glass-card rounded-2xl p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-center gap-2 text-text-secondary">
          <Users className="h-4 w-4" />
          <span className="text-sm font-medium">
            {players.length} player{players.length !== 1 ? "s" : ""} joined
          </span>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          {players.map((player, i) => (
            <motion.div
              key={player._id}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1 }}
              className="flex items-center gap-2 rounded-full bg-cream px-4 py-2"
            >
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: player.color }}
              >
                {player.name.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm font-medium">
                {player.name}
                {player.sessionId === game.hostId && (
                  <span className="ml-1 text-xs text-text-secondary">
                    (host)
                  </span>
                )}
              </span>
              {isHost && player.sessionId !== sessionId && (
                <button
                  onClick={() =>
                    kickPlayer({ gameId: game._id, sessionId, playerId: player._id })
                  }
                  className="ml-1 flex h-5 w-5 items-center justify-center rounded-full text-text-secondary/50 transition-colors hover:bg-red-100 hover:text-red-500"
                  title={`Kick ${player.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </motion.div>
          ))}
        </div>
      </div>

      {/* Start Button */}
      {isHost && (
        <button
          onClick={handleStart}
          disabled={players.length < 2 || starting}
          className="w-full rounded-xl bg-primary px-6 py-4 text-lg font-semibold text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
        >
          {starting
            ? "Starting..."
            : players.length < 2
              ? "Need at least 2 players"
              : "Start Game"}
        </button>
      )}

      {!isHost && (
        <div className="flex flex-col items-center gap-3">
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="h-2 w-2 rounded-full bg-primary/40"
                animate={{ scale: [1, 1.5, 1], opacity: [0.4, 1, 0.4] }}
                transition={{
                  duration: 1.2,
                  repeat: Infinity,
                  delay: i * 0.2,
                }}
              />
            ))}
          </div>
          <p className="text-text-secondary">Waiting for host to start...</p>
        </div>
      )}
    </div>
  );
}
