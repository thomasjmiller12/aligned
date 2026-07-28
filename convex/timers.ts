import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { scoreGuess } from "./scoring";

export const autoLockClues = internalMutation({
  // `deadline` is the timerEndsAt this call was scheduled for. A room that
  // plays again within the clue-timer window would otherwise have the previous
  // game's timer fire mid-clue-phase and skip everyone who hadn't submitted.
  args: { gameId: v.id("games"), deadline: v.optional(v.number()) },
  handler: async (ctx, { gameId, deadline }) => {
    const game = await ctx.db.get(gameId);
    if (!game || game.status !== "clue_phase") return;
    if (deadline !== undefined && game.timerEndsAt !== deadline) return;

    // Find rounds without clues and mark them
    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();

    for (const round of rounds) {
      if (round.status === "pending" && !round.clue) {
        await ctx.db.patch(round._id, { status: "scored" });
      }
    }

    // Find the first round that has a clue and start guessing
    const firstCluedRound = rounds
      .sort((a, b) => a.roundIndex - b.roundIndex)
      .find((r) => r.clue && r.status !== "scored");

    if (firstCluedRound) {
      await ctx.db.patch(firstCluedRound._id, { status: "guessing" });
      const timerEndsAt = Date.now() + game.settings.guessTimerSeconds * 1000;
      await ctx.db.patch(gameId, {
        status: "guessing",
        currentRound: firstCluedRound.roundIndex,
        timerEndsAt,
      });

      // Schedule auto-lock for guesses
      await ctx.scheduler.runAfter(
        game.settings.guessTimerSeconds * 1000,
        internal.timers.autoLockGuesses,
        { roundId: firstCluedRound._id }
      );
    } else {
      await ctx.db.patch(gameId, {
        status: "game_over",
        timerEndsAt: undefined,
      });
    }
  },
});

export const autoLockGuesses = internalMutation({
  args: { roundId: v.id("rounds") },
  handler: async (ctx, { roundId }) => {
    const round = await ctx.db.get(roundId);
    if (!round || round.status !== "guessing") return;

    const game = await ctx.db.get(round.gameId);
    if (!game || game.status !== "guessing") return;

    const guesses = await ctx.db
      .query("guesses")
      .withIndex("by_round", (q) => q.eq("roundId", roundId))
      .collect();

    // Lock all unlocked guesses
    for (const guess of guesses) {
      if (!guess.lockedIn) {
        await ctx.db.patch(guess._id, { lockedIn: true });
      }
    }

    // Auto-reveal: calculate scores and advance to revealing
    let roundScore = 0;
    for (const guess of guesses) {
      roundScore += scoreGuess(guess.position, round.targetPosition);
    }

    await ctx.db.patch(round._id, { status: "revealing" });
    await ctx.db.patch(game._id, {
      status: "revealing",
      teamScore: game.teamScore + roundScore,
      timerEndsAt: undefined,
    });
  },
});
