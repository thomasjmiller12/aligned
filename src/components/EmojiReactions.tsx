"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import {
  playReactionPoop,
  playReactionSkull,
  playReactionSleep,
} from "@/lib/sounds";

const EMOJIS = ["💩", "💀", "😴"] as const;

const EMOJI_SOUNDS: Record<string, () => void> = {
  "💩": playReactionPoop,
  "💀": playReactionSkull,
  "😴": playReactionSleep,
};

interface FloatingReaction {
  id: string;
  emoji: string;
  left: number; // % from left
  duration: number; // seconds
  swayClass: string; // which sway animation
  delay: number; // small random delay for stagger
  size: number; // font size in rem
}

// Multiple sway patterns for variety
const SWAY_CLASSES = [
  "animate-float-sway-1",
  "animate-float-sway-2",
  "animate-float-sway-3",
  "animate-float-sway-4",
] as const;

function makeFloater(emoji: string, id: string): FloatingReaction {
  return {
    id,
    emoji,
    left: 5 + Math.random() * 80,
    duration: 8 + Math.random() * 7, // 8-15s
    swayClass: SWAY_CLASSES[Math.floor(Math.random() * SWAY_CLASSES.length)],
    delay: Math.random() * 0.3,
    size: 1.8 + Math.random() * 1.2, // 1.8-3rem
  };
}

export default function EmojiReactions({
  gameId,
  sessionId,
}: {
  gameId: Id<"games">;
  sessionId: string;
}) {
  const sendReaction = useMutation(api.games.sendReaction);
  const reactions = useQuery(api.games.getReactions, { gameId, sessionId });
  const [floating, setFloating] = useState<FloatingReaction[]>([]);
  const seenIds = useRef(new Set<string>());
  const initialLoadRef = useRef(true);
  const localIdCounter = useRef(0);

  // Process reactions from OTHER players via query
  useEffect(() => {
    if (!reactions) return;

    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      for (const r of reactions) {
        seenIds.current.add(r._id);
      }
      return;
    }

    const newReactions: FloatingReaction[] = [];
    for (const r of reactions) {
      if (seenIds.current.has(r._id)) continue;
      seenIds.current.add(r._id);
      newReactions.push(makeFloater(r.emoji, r._id));
    }

    if (newReactions.length > 0) {
      const sound = EMOJI_SOUNDS[newReactions[0].emoji];
      if (sound) sound();
      setFloating((prev) => [...prev, ...newReactions]);
    }
  }, [reactions]);

  // Remove finished animations
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setFloating((prev) => prev.filter((r) => {
        const age = (now - parseInt(r.id.split("-")[1] || "0", 10)) / 1000;
        // Keep if we can't parse the timestamp, or if younger than duration + 1s
        return isNaN(age) || age < r.duration + 1;
      }));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleSend = useCallback(
    (emoji: string) => {
      // Optimistic: show immediately with timestamp-based ID
      const localId = `local-${Date.now()}-${++localIdCounter.current}`;
      const sound = EMOJI_SOUNDS[emoji];
      if (sound) sound();
      setFloating((prev) => [...prev, makeFloater(emoji, localId)]);
      sendReaction({ gameId, sessionId, emoji });
    },
    [gameId, sessionId, sendReaction]
  );

  return (
    <>
      {/* CSS keyframe definitions */}
      <style jsx global>{`
        @keyframes float-rise {
          0% {
            transform: translateY(0) scale(0);
            opacity: 0;
          }
          3% {
            transform: translateY(-10px) scale(1.3);
            opacity: 0.75;
          }
          8% {
            transform: translateY(-30px) scale(1);
            opacity: 0.7;
          }
          50% {
            opacity: 0.55;
          }
          85% {
            opacity: 0.3;
          }
          100% {
            transform: translateY(-500px) scale(0.3);
            opacity: 0;
          }
        }
        @keyframes sway-1 {
          0%, 100% { transform: translateX(0) rotate(0deg); }
          20% { transform: translateX(25px) rotate(8deg); }
          40% { transform: translateX(-20px) rotate(-12deg); }
          60% { transform: translateX(30px) rotate(6deg); }
          80% { transform: translateX(-15px) rotate(-4deg); }
        }
        @keyframes sway-2 {
          0%, 100% { transform: translateX(0) rotate(0deg); }
          15% { transform: translateX(-30px) rotate(-10deg); }
          35% { transform: translateX(20px) rotate(15deg); }
          55% { transform: translateX(-35px) rotate(-8deg); }
          75% { transform: translateX(15px) rotate(5deg); }
        }
        @keyframes sway-3 {
          0%, 100% { transform: translateX(0) rotate(0deg); }
          25% { transform: translateX(40px) rotate(12deg); }
          50% { transform: translateX(-10px) rotate(-6deg); }
          75% { transform: translateX(20px) rotate(10deg); }
        }
        @keyframes sway-4 {
          0%, 100% { transform: translateX(0) rotate(0deg); }
          10% { transform: translateX(-15px) rotate(-15deg); }
          30% { transform: translateX(35px) rotate(10deg); }
          50% { transform: translateX(-25px) rotate(-12deg); }
          70% { transform: translateX(40px) rotate(8deg); }
          90% { transform: translateX(-10px) rotate(-5deg); }
        }
        .animate-float-sway-1 > span { animation: sway-1 3s ease-in-out infinite; }
        .animate-float-sway-2 > span { animation: sway-2 3.5s ease-in-out infinite; }
        .animate-float-sway-3 > span { animation: sway-3 4s ease-in-out infinite; }
        .animate-float-sway-4 > span { animation: sway-4 2.8s ease-in-out infinite; }
      `}</style>

      {/* Full-screen floating emoji overlay */}
      <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
        {floating.map((r) => (
          <div
            key={r.id}
            className={r.swayClass}
            style={{
              position: "absolute",
              bottom: "10px",
              left: `${r.left}%`,
              animation: `float-rise ${r.duration}s ease-out ${r.delay}s forwards`,
              willChange: "transform, opacity",
            }}
          >
            <span
              className="drop-shadow-md inline-block"
              style={{ fontSize: `${r.size}rem` }}
            >
              {r.emoji}
            </span>
          </div>
        ))}
      </div>

      {/* Reaction buttons — right side, above chat */}
      <div className="fixed right-3 bottom-24 z-50 flex flex-col gap-1.5 sm:gap-2">
        {EMOJIS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => handleSend(emoji)}
            className="rounded-full bg-white/80 p-1.5 sm:p-2 text-lg sm:text-xl shadow-md backdrop-blur-sm transition-transform hover:scale-110 active:scale-90"
          >
            {emoji}
          </button>
        ))}
      </div>
    </>
  );
}
