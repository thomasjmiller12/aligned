"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { getSessionId } from "@/lib/session";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Sparkles, Users } from "lucide-react";
import FluidBackground from "@/components/FluidBackground";

export default function LandingPage() {
  const router = useRouter();
  const createGame = useMutation(api.games.createGame);
  const joinGame = useMutation(api.games.joinGame);

  const [mode, setMode] = useState<"idle" | "host" | "join">("idle");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleHost() {
    if (!name.trim()) return setError("Enter your name");
    setLoading(true);
    setError("");
    try {
      const sessionId = getSessionId();
      const result = await createGame({ hostName: name.trim(), sessionId });
      router.push(`/game/${result.code}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create game");
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin() {
    if (!name.trim()) return setError("Enter your name");
    if (!code.trim() || code.trim().length !== 4)
      return setError("Enter a 4-letter game code");
    setLoading(true);
    setError("");
    try {
      const sessionId = getSessionId();
      await joinGame({
        code: code.trim().toUpperCase(),
        playerName: name.trim(),
        sessionId,
      });
      router.push(`/game/${code.trim().toUpperCase()}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to join game");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-6">
      <FluidBackground interactive playerColor="#E8553A" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative w-full max-w-md"
      >
        {/* Logo */}
        <div className="mb-12 text-center">
          <motion.h1
            className="text-6xl font-bold tracking-tight text-primary"
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            Aligned
          </motion.h1>
          <p className="mt-3 text-lg text-text-secondary">
            Read each other&apos;s minds across the spectrum
          </p>
        </div>

        {/* Main Card */}
        <div className="rounded-2xl bg-white p-8 shadow-lg shadow-black/5">
          {mode === "idle" && (
            <motion.div
              className="space-y-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <button
                onClick={() => setMode("host")}
                className="flex w-full items-center justify-center gap-3 rounded-xl bg-primary px-6 py-4 text-lg font-semibold text-white transition-all hover:brightness-110 active:scale-[0.98]"
              >
                <Sparkles className="h-5 w-5" />
                Host a Game
              </button>
              <button
                onClick={() => setMode("join")}
                className="flex w-full items-center justify-center gap-3 rounded-xl border-2 border-primary/20 px-6 py-4 text-lg font-semibold text-primary transition-all hover:bg-primary/5 active:scale-[0.98]"
              >
                <Users className="h-5 w-5" />
                Join a Game
              </button>
            </motion.div>
          )}

          {mode === "host" && (
            <motion.div
              className="space-y-4"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <h2 className="text-xl font-semibold">Host a Game</h2>
              <input
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={20}
                autoFocus
                className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-lg outline-none transition-colors focus:border-primary"
                onKeyDown={(e) => e.key === "Enter" && handleHost()}
              />
              {error && <p className="text-sm text-red-500">{error}</p>}
              <button
                onClick={handleHost}
                disabled={loading}
                className="w-full rounded-xl bg-primary px-6 py-3 text-lg font-semibold text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
              >
                {loading ? "Creating..." : "Create Game"}
              </button>
              <button
                onClick={() => {
                  setMode("idle");
                  setError("");
                }}
                className="w-full text-sm text-text-secondary hover:text-text"
              >
                Back
              </button>
            </motion.div>
          )}

          {mode === "join" && (
            <motion.div
              className="space-y-4"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <h2 className="text-xl font-semibold">Join a Game</h2>
              <input
                type="text"
                placeholder="Game code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={4}
                autoFocus
                className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-center text-2xl font-bold tracking-[0.3em] uppercase outline-none transition-colors focus:border-primary"
                onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              />
              <input
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={20}
                className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-lg outline-none transition-colors focus:border-primary"
                onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              />
              {error && <p className="text-sm text-red-500">{error}</p>}
              <button
                onClick={handleJoin}
                disabled={loading}
                className="w-full rounded-xl bg-primary px-6 py-3 text-lg font-semibold text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
              >
                {loading ? "Joining..." : "Join Game"}
              </button>
              <button
                onClick={() => {
                  setMode("idle");
                  setError("");
                }}
                className="w-full text-sm text-text-secondary hover:text-text"
              >
                Back
              </button>
            </motion.div>
          )}
        </div>

        <p className="mt-8 text-center text-sm text-text-secondary">
          A collaborative guessing game for 2–8 players
        </p>
      </motion.div>
    </div>
  );
}
