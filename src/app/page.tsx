"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { getSessionId } from "@/lib/session";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Sparkles, Users } from "lucide-react";
import FluidBackground from "@/components/FluidBackground";
import { Button } from "@/components/ui/Button";

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
      <FluidBackground interactive playerColor="#6FE0D2" />

      {/* Faint band of surface light behind the wordmark — just below the waterline. */}
      <div
        className="pointer-events-none absolute left-1/2 top-[18%] h-64 w-[130%] -translate-x-1/2 rounded-full opacity-60 blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, rgba(111,224,210,0.14), transparent 70%)",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative w-full max-w-md"
      >
        {/* Logo */}
        <div className="mb-12 text-center">
          <motion.h1
            className="lit font-title text-5xl font-light uppercase tracking-[0.18em] text-foam"
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            Aligned
          </motion.h1>
          <p className="mt-3 text-lg text-silt">
            Read each other&apos;s minds across the spectrum
          </p>
        </div>

        {/* Main Card */}
        <div className="panel-lit rounded-2xl p-8">
          {mode === "idle" && (
            <motion.div
              className="space-y-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <Button
                onClick={() => setMode("host")}
                variant="primary"
                size="lg"
                fullWidth
              >
                <Sparkles className="h-5 w-5" />
                Host a Game
              </Button>
              <Button
                onClick={() => setMode("join")}
                variant="secondary"
                size="lg"
                fullWidth
              >
                <Users className="h-5 w-5" />
                Join a Game
              </Button>
            </motion.div>
          )}

          {mode === "host" && (
            <motion.div
              className="space-y-4"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <h2 className="text-xl font-semibold text-foam">Host a Game</h2>
              <input
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={20}
                autoFocus
                className="w-full rounded-xl border border-caustic/20 bg-abyss/40 px-4 py-3 text-lg text-foam outline-none transition-all placeholder:text-silt/60 focus:border-caustic focus:ring-2 focus:ring-caustic/20"
                onKeyDown={(e) => e.key === "Enter" && handleHost()}
              />
              {error && <p className="text-sm text-danger">{error}</p>}
              <Button
                onClick={handleHost}
                disabled={loading}
                variant="primary"
                size="lg"
                fullWidth
              >
                {loading ? "Creating..." : "Create Game"}
              </Button>
              <Button
                onClick={() => {
                  setMode("idle");
                  setError("");
                }}
                variant="ghost"
                size="md"
                fullWidth
              >
                Back
              </Button>
            </motion.div>
          )}

          {mode === "join" && (
            <motion.div
              className="space-y-4"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <h2 className="text-xl font-semibold text-foam">Join a Game</h2>
              <input
                type="text"
                placeholder="Game code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={4}
                autoFocus
                className="w-full rounded-xl border border-caustic/20 bg-abyss/40 px-4 py-3 text-center font-title text-2xl uppercase tracking-[0.3em] text-foam outline-none transition-all placeholder:text-silt/60 focus:border-caustic focus:ring-2 focus:ring-caustic/20"
                onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              />
              <input
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={20}
                className="w-full rounded-xl border border-caustic/20 bg-abyss/40 px-4 py-3 text-lg text-foam outline-none transition-all placeholder:text-silt/60 focus:border-caustic focus:ring-2 focus:ring-caustic/20"
                onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              />
              {error && <p className="text-sm text-danger">{error}</p>}
              <Button
                onClick={handleJoin}
                disabled={loading}
                variant="primary"
                size="lg"
                fullWidth
              >
                {loading ? "Joining..." : "Join Game"}
              </Button>
              <Button
                onClick={() => {
                  setMode("idle");
                  setError("");
                }}
                variant="ghost"
                size="md"
                fullWidth
              >
                Back
              </Button>
            </motion.div>
          )}
        </div>

        <p className="mt-8 text-center text-sm text-silt">
          A collaborative guessing game for 2–16 players
        </p>

        <a
          href="https://github.com/thomasjmiller12/aligned"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex items-center justify-center gap-1.5 text-xs text-silt/60 transition-colors hover:text-silt"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
          </svg>
          Source on GitHub
        </a>
      </motion.div>
    </div>
  );
}
