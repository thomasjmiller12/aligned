"use client";

import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { Copy, Check, Volume2, VolumeX } from "lucide-react";
import { useEffect, useState } from "react";
import { useSound } from "@/hooks/useSound";
import { Button } from "@/components/ui/Button";

interface GameHeaderProps {
  code: string;
  teamScore: number;
  currentRound: number;
  totalRounds: number;
  status: string;
}

export default function GameHeader({
  code,
  teamScore,
  currentRound,
  totalRounds,
  status,
}: GameHeaderProps) {
  const [copied, setCopied] = useState(false);
  const { isMuted, toggleMute } = useSound();

  const teamScoreValue = useMotionValue(teamScore);
  const roundedTeamScore = useTransform(teamScoreValue, (v) => Math.round(v));
  const [displayScore, setDisplayScore] = useState(teamScore);

  useEffect(() => {
    const controls = animate(teamScoreValue, teamScore, {
      duration: 0.6,
      ease: "easeOut",
    });
    return () => controls.stop();
  }, [teamScore, teamScoreValue]);

  useEffect(() => {
    return roundedTeamScore.on("change", (v) => setDisplayScore(v));
  }, [roundedTeamScore]);

  function copyCode() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const showScore = status !== "lobby";
  const showRounds = status !== "lobby" && status !== "game_over";

  return (
    <header className="relative grid grid-cols-3 items-center bg-abyss/30 px-4 py-3">
      {/* Game Code + Sound — left */}
      <div className="flex items-center gap-1 justify-start">
        <Button
          variant="ghost"
          size="sm"
          onClick={copyCode}
          className="gap-2 font-title tracking-widest text-silt hover:text-foam"
        >
          {code}
          {copied ? (
            <Check className="h-3.5 w-3.5 text-success" />
          ) : (
            <Copy className="h-3.5 w-3.5 text-silt" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleMute}
          aria-label={isMuted ? "Unmute sounds" : "Mute sounds"}
        >
          {isMuted ? (
            <VolumeX className="h-3.5 w-3.5" />
          ) : (
            <Volume2 className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      {/* Team Score — center */}
      <div className="flex justify-center">
        {showScore && (
          <div className="text-center">
            <div className="text-xs font-medium uppercase tracking-wider text-silt">
              Team Score
            </div>
            <motion.div
              key={teamScore}
              initial={{ scale: 1.3 }}
              animate={{ scale: 1 }}
              className="lit font-title text-2xl font-bold text-foam tabular-nums"
            >
              {displayScore}
            </motion.div>
          </div>
        )}
      </div>

      {/* Round Indicator — right */}
      <div className="flex justify-end">
        {showRounds && (
          <div className="flex items-center gap-1.5">
            {Array.from({ length: totalRounds }).map((_, i) => (
              <div
                key={i}
                className={`h-2 w-2 rounded-full transition-colors ${
                  i < currentRound
                    ? "bg-caustic"
                    : i === currentRound
                      ? "bg-transparent ring-2 ring-caustic shadow-[0_0_6px_rgba(111,224,210,0.55)]"
                      : "bg-shoal"
                }`}
              />
            ))}
          </div>
        )}
      </div>

      <div className="rule-caustic absolute inset-x-0 bottom-0" />
    </header>
  );
}
