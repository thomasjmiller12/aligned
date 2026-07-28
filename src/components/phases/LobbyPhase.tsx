"use client";

import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc } from "../../../convex/_generated/dataModel";
import { Check, Users, Share2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { playPlayerJoined } from "@/lib/sounds";
import { PLAYER_COLORS } from "@/lib/colors";
import { Button } from "@/components/ui/Button";

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
  const updatePlayerColor = useMutation(api.games.updatePlayerColor);
  const updatePlayerName = useMutation(api.games.updatePlayerName);
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const prevPlayerCountRef = useRef(players.length);

  const me = players.find((p) => p.sessionId === sessionId);
  const [nameDraft, setNameDraft] = useState(me?.name ?? "");
  const canSaveName = !!nameDraft.trim() && nameDraft.trim() !== me?.name;

  useEffect(() => {
    if (players.length > prevPlayerCountRef.current) {
      playPlayerJoined();
    }
    prevPlayerCountRef.current = players.length;
  }, [players.length]);

  // Follow the server name (initial load, or a change from another tab) without
  // clobbering whatever the player is currently typing.
  const serverNameRef = useRef(me?.name);
  useEffect(() => {
    if (me?.name !== undefined && me.name !== serverNameRef.current) {
      serverNameRef.current = me.name;
      setNameDraft(me.name);
    }
  }, [me?.name]);

  async function handleNameSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const trimmed = nameDraft.trim();
    if (!trimmed) return setNameDraft(me?.name ?? "");
    if (trimmed === me?.name) return;
    try {
      await updatePlayerName({ gameId: game._id, sessionId, name: trimmed });
    } catch {
      setNameDraft(me?.name ?? "");
    }
  }

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
        <p className="mb-2 text-sm font-medium uppercase tracking-wider text-silt">
          Share this code
        </p>
        <Button variant="secondary" size="lg" onClick={shareOrCopy} className="gap-3">
          <span className="lit font-title text-4xl font-bold tracking-[0.4em] text-foam">
            {game.code}
          </span>
          {copied ? (
            <Check className="h-6 w-6 text-success" />
          ) : (
            <Share2 className="h-6 w-6 text-caustic" />
          )}
        </Button>
        <p className="mt-2 text-xs text-silt">
          {copied ? "Copied!" : "Tap to copy or share"}
        </p>
      </div>

      {/* Players List */}
      <div className="panel-lit rounded-2xl p-6">
        <div className="mb-4 flex items-center justify-center gap-2 text-silt">
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
              className="flex items-center gap-2 rounded-full px-4 py-2 transition-colors hover:bg-foam/5"
            >
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: player.color }}
              >
                {player.name.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm font-medium text-foam">
                {player.name}
                {player.sessionId === game.hostId && (
                  <span className="ml-1 text-xs text-silt">(host)</span>
                )}
              </span>
              {isHost && player.sessionId !== sessionId && (
                <Button
                  variant="ghost"
                  size="md"
                  onClick={() =>
                    kickPlayer({ gameId: game._id, sessionId, playerId: player._id })
                  }
                  title={`Kick ${player.name}`}
                  aria-label={`Kick ${player.name}`}
                  className="!h-6 !w-6 !min-w-0 !gap-0 !rounded-xl !p-0"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </motion.div>
          ))}
        </div>
      </div>

      {/* You: name + color */}
      {me && (
        <div className="panel-lit space-y-5 rounded-2xl p-5">
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-silt">
              Your name
            </p>
            <form
              onSubmit={handleNameSubmit}
              className="mx-auto flex max-w-xs items-center gap-2"
            >
              <input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={handleNameSubmit}
                maxLength={20}
                placeholder="Your name"
                aria-label="Your name"
                className="min-w-0 flex-1 rounded-xl border border-caustic/20 bg-abyss/40 px-4 py-2.5 text-center text-base font-medium text-foam outline-none placeholder:text-silt transition-colors focus:border-caustic focus:ring-2 focus:ring-caustic/30"
              />
              <Button type="submit" variant="secondary" size="md" disabled={!canSaveName}>
                Save
              </Button>
            </form>
          </div>

          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-silt">
              Your color
            </p>
            <div className="flex flex-wrap justify-center gap-2">
            {PLAYER_COLORS.map((c) => {
              const isSelected = me.color === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() =>
                    updatePlayerColor({ gameId: game._id, sessionId, color: c })
                  }
                  aria-label={`Choose color ${c}`}
                  aria-pressed={isSelected}
                  className={[
                    "h-8 w-8 rounded-full transition-transform hover:scale-110 active:scale-95",
                    isSelected
                      ? "scale-110 ring-2 ring-caustic ring-offset-2 ring-offset-deep"
                      : "",
                  ].join(" ")}
                  style={{ backgroundColor: c }}
                />
              );
            })}
            </div>
          </div>
        </div>
      )}

      {/* Start Button */}
      {isHost && (
        <Button
          variant="primary"
          size="lg"
          fullWidth
          onClick={handleStart}
          disabled={players.length < 2 || starting}
        >
          {starting
            ? "Starting..."
            : players.length < 2
              ? "Need at least 2 players"
              : "Start Game"}
        </Button>
      )}

      {!isHost && (
        <div className="flex flex-col items-center gap-3">
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="h-2 w-2 rounded-full bg-caustic/40"
                animate={{ scale: [1, 1.5, 1], opacity: [0.4, 1, 0.4] }}
                transition={{
                  duration: 1.2,
                  repeat: Infinity,
                  delay: i * 0.2,
                }}
              />
            ))}
          </div>
          <p className="text-silt">Waiting for host to start...</p>
        </div>
      )}
    </div>
  );
}
