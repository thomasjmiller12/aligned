import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { getRandomSpectrums } from "./spectrums";

const PLAYER_COLORS = [
  "#E8553A",
  "#2A9D8F",
  "#7C3AED",
  "#F59E0B",
  "#EC4899",
  "#06B6D4",
  "#84CC16",
  "#F97316",
];

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export const createGame = mutation({
  args: { hostName: v.string(), sessionId: v.string() },
  handler: async (ctx, { hostName, sessionId }) => {
    // Generate a unique code
    let code: string;
    let existing;
    do {
      code = generateCode();
      existing = await ctx.db
        .query("games")
        .withIndex("by_code", (q) => q.eq("code", code))
        .first();
    } while (existing && existing.status !== "game_over");

    const gameId = await ctx.db.insert("games", {
      code,
      hostId: sessionId,
      status: "lobby",
      currentRound: 0,
      teamScore: 0,
      settings: {
        clueTimerSeconds: 120,
        guessTimerSeconds: 90,
      },
    });

    await ctx.db.insert("players", {
      gameId,
      sessionId,
      name: hostName,
      color: PLAYER_COLORS[0],
      order: 0,
      isConnected: true,
    });

    return { gameId, code };
  },
});

export const joinGame = mutation({
  args: {
    code: v.string(),
    playerName: v.string(),
    sessionId: v.string(),
  },
  handler: async (ctx, { code, playerName, sessionId }) => {
    const game = await ctx.db
      .query("games")
      .withIndex("by_code", (q) => q.eq("code", code.toUpperCase()))
      .first();

    if (!game) throw new Error("Game not found");
    if (game.status !== "lobby") throw new Error("Game already started");

    // Check if player already in game (reconnecting)
    const existingPlayer = await ctx.db
      .query("players")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .filter((q) => q.eq(q.field("gameId"), game._id))
      .first();

    if (existingPlayer) {
      await ctx.db.patch(existingPlayer._id, { isConnected: true });
      return { gameId: game._id, playerId: existingPlayer._id };
    }

    const players = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect();

    if (players.length >= 8) throw new Error("Game is full (max 8 players)");

    const playerId = await ctx.db.insert("players", {
      gameId: game._id,
      sessionId,
      name: playerName,
      color: PLAYER_COLORS[players.length % PLAYER_COLORS.length],
      order: players.length,
      isConnected: true,
    });

    return { gameId: game._id, playerId };
  },
});

export const startGame = mutation({
  args: { gameId: v.id("games"), sessionId: v.string() },
  handler: async (ctx, { gameId, sessionId }) => {
    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (game.hostId !== sessionId) throw new Error("Only the host can start");
    if (game.status !== "lobby") throw new Error("Game already started");

    const players = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();

    if (players.length < 2) throw new Error("Need at least 2 players");

    // Shuffle player order
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    for (let i = 0; i < shuffled.length; i++) {
      await ctx.db.patch(shuffled[i]._id, { order: i });
    }

    // Create rounds with spectrums
    const spectrums = getRandomSpectrums(shuffled.length);
    for (let i = 0; i < shuffled.length; i++) {
      const targetPosition = Math.floor(Math.random() * 141) + 20; // 20-160
      await ctx.db.insert("rounds", {
        gameId,
        roundIndex: i,
        clueGiverId: shuffled[i]._id,
        spectrumLeft: spectrums[i][0],
        spectrumRight: spectrums[i][1],
        targetPosition,
        status: "pending",
      });
    }

    const timerEndsAt = Date.now() + game.settings.clueTimerSeconds * 1000;
    await ctx.db.patch(gameId, {
      status: "clue_phase",
      currentRound: 0,
      timerEndsAt,
    });

    // Schedule auto-lock for clues
    await ctx.scheduler.runAfter(
      game.settings.clueTimerSeconds * 1000,
      internal.timers.autoLockClues,
      { gameId }
    );
  },
});

export const submitClue = mutation({
  args: {
    roundId: v.id("rounds"),
    sessionId: v.string(),
    clue: v.string(),
  },
  handler: async (ctx, { roundId, sessionId, clue }) => {
    const round = await ctx.db.get(roundId);
    if (!round) throw new Error("Round not found");

    const player = await ctx.db.get(round.clueGiverId);
    if (!player || player.sessionId !== sessionId) {
      throw new Error("Not your round to give a clue");
    }

    await ctx.db.patch(roundId, { clue, status: "clue_given" });
  },
});

export const submitGuess = mutation({
  args: {
    roundId: v.id("rounds"),
    sessionId: v.string(),
    position: v.number(),
  },
  handler: async (ctx, { roundId, sessionId, position }) => {
    const round = await ctx.db.get(roundId);
    if (!round) throw new Error("Round not found");

    const player = await ctx.db
      .query("players")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .filter((q) => q.eq(q.field("gameId"), round.gameId))
      .first();

    if (!player) throw new Error("Player not found");
    if (player._id === round.clueGiverId) {
      throw new Error("Clue-giver cannot guess");
    }

    const existing = await ctx.db
      .query("guesses")
      .withIndex("by_round_player", (q) =>
        q.eq("roundId", roundId).eq("playerId", player._id)
      )
      .first();

    if (existing) {
      if (existing.lockedIn) return; // Already locked in
      await ctx.db.patch(existing._id, { position });
    } else {
      await ctx.db.insert("guesses", {
        roundId,
        playerId: player._id,
        position,
        lockedIn: false,
      });
    }
  },
});

export const lockGuess = mutation({
  args: { roundId: v.id("rounds"), sessionId: v.string() },
  handler: async (ctx, { roundId, sessionId }) => {
    const round = await ctx.db.get(roundId);
    if (!round) throw new Error("Round not found");

    const player = await ctx.db
      .query("players")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .filter((q) => q.eq(q.field("gameId"), round.gameId))
      .first();

    if (!player) throw new Error("Player not found");

    const guess = await ctx.db
      .query("guesses")
      .withIndex("by_round_player", (q) =>
        q.eq("roundId", roundId).eq("playerId", player._id)
      )
      .first();

    if (!guess) throw new Error("No guess to lock");
    await ctx.db.patch(guess._id, { lockedIn: true });

    // Auto-reveal when all guessers have locked in
    const game = await ctx.db.get(round.gameId);
    if (!game || game.status !== "guessing") return;

    const players = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", round.gameId))
      .collect();
    const totalGuessers = players.length - 1; // exclude clue giver

    const allGuesses = await ctx.db
      .query("guesses")
      .withIndex("by_round", (q) => q.eq("roundId", roundId))
      .collect();
    const lockedCount = allGuesses.filter((g) => g.lockedIn).length;

    if (lockedCount >= totalGuessers && totalGuessers > 0) {
      // Everyone locked — auto-reveal
      let roundScore = 0;
      for (const g of allGuesses) {
        const diff = Math.abs(g.position - round.targetPosition);
        if (diff <= 5) roundScore += 4;
        else if (diff <= 10) roundScore += 3;
        else if (diff <= 15) roundScore += 2;
      }

      await ctx.db.patch(round._id, { status: "revealing" });
      await ctx.db.patch(game._id, {
        status: "revealing",
        teamScore: game.teamScore + roundScore,
        timerEndsAt: undefined,
      });
    }
  },
});

export const advanceToGuessing = mutation({
  args: { gameId: v.id("games"), sessionId: v.string() },
  handler: async (ctx, { gameId, sessionId }) => {
    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (game.hostId !== sessionId) throw new Error("Only the host can advance");

    // Find the first round that has a clue submitted
    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();

    const firstCluedRound = rounds
      .sort((a, b) => a.roundIndex - b.roundIndex)
      .find((r) => r.clue && r.status !== "scored");

    if (!firstCluedRound) {
      // No clues at all — game over
      await ctx.db.patch(gameId, {
        status: "game_over",
        timerEndsAt: undefined,
      });
      return;
    }

    // Skip any rounds before the first clued round
    for (const r of rounds) {
      if (r.roundIndex < firstCluedRound.roundIndex && !r.clue) {
        await ctx.db.patch(r._id, { status: "scored" });
      }
    }

    await ctx.db.patch(firstCluedRound._id, {
      status: "guessing",
    });

    const timerEndsAt = Date.now() + game.settings.guessTimerSeconds * 1000;
    await ctx.db.patch(gameId, {
      status: "guessing",
      currentRound: firstCluedRound.roundIndex,
      timerEndsAt,
    });

    await ctx.scheduler.runAfter(
      game.settings.guessTimerSeconds * 1000,
      internal.timers.autoLockGuesses,
      { roundId: firstCluedRound._id }
    );
  },
});

export const revealRound = mutation({
  args: { gameId: v.id("games"), sessionId: v.string() },
  handler: async (ctx, { gameId, sessionId }) => {
    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (game.hostId !== sessionId) throw new Error("Only the host can reveal");
    if (game.status !== "guessing") return; // Already revealed or wrong state

    const round = await ctx.db
      .query("rounds")
      .withIndex("by_game_round", (q) =>
        q.eq("gameId", gameId).eq("roundIndex", game.currentRound)
      )
      .first();

    if (!round || round.status !== "guessing") return; // Already revealed

    // Lock any remaining unlocked guesses
    const guesses = await ctx.db
      .query("guesses")
      .withIndex("by_round", (q) => q.eq("roundId", round._id))
      .collect();

    for (const guess of guesses) {
      if (!guess.lockedIn) {
        await ctx.db.patch(guess._id, { lockedIn: true });
      }
    }

    // Calculate scores (±5°=4pt, ±10°=3pt, ±15°=2pt)
    let roundScore = 0;
    for (const guess of guesses) {
      const diff = Math.abs(guess.position - round.targetPosition);
      if (diff <= 5) roundScore += 4;
      else if (diff <= 10) roundScore += 3;
      else if (diff <= 15) roundScore += 2;
    }

    await ctx.db.patch(round._id, { status: "revealing" });
    await ctx.db.patch(gameId, {
      status: "revealing",
      teamScore: game.teamScore + roundScore,
      timerEndsAt: undefined,
    });
  },
});

export const nextRound = mutation({
  args: { gameId: v.id("games"), sessionId: v.string() },
  handler: async (ctx, { gameId, sessionId }) => {
    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (game.hostId !== sessionId) throw new Error("Only host can advance");
    if (game.status !== "revealing") return; // Wrong state, idempotent

    // Mark current round as scored
    const currentRound = await ctx.db
      .query("rounds")
      .withIndex("by_game_round", (q) =>
        q.eq("gameId", gameId).eq("roundIndex", game.currentRound)
      )
      .first();
    if (currentRound) {
      await ctx.db.patch(currentRound._id, { status: "scored" });
    }

    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();

    // Find the next round with a clue, skipping uncluded rounds
    const nextCluedRound = rounds
      .filter((r) => r.roundIndex > game.currentRound && r.clue)
      .sort((a, b) => a.roundIndex - b.roundIndex)[0];

    // Mark all skipped rounds as scored
    for (const r of rounds) {
      if (
        r.roundIndex > game.currentRound &&
        r.status !== "scored" &&
        r._id !== nextCluedRound?._id
      ) {
        await ctx.db.patch(r._id, { status: "scored" });
      }
    }

    if (!nextCluedRound) {
      // No more rounds with clues — game over
      await ctx.db.patch(gameId, {
        status: "game_over",
        currentRound: game.currentRound + 1,
        timerEndsAt: undefined,
      });
    } else {
      await ctx.db.patch(nextCluedRound._id, { status: "guessing" });
      const timerEndsAt =
        Date.now() + game.settings.guessTimerSeconds * 1000;
      await ctx.db.patch(gameId, {
        status: "guessing",
        currentRound: nextCluedRound.roundIndex,
        timerEndsAt,
      });
      await ctx.scheduler.runAfter(
        game.settings.guessTimerSeconds * 1000,
        internal.timers.autoLockGuesses,
        { roundId: nextCluedRound._id }
      );
    }
  },
});

export const claimHost = mutation({
  args: { gameId: v.id("games"), sessionId: v.string() },
  handler: async (ctx, { gameId, sessionId }) => {
    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (game.hostId === sessionId) return; // Already host

    // Verify the claimer is a player in this game
    const player = await ctx.db
      .query("players")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .filter((q) => q.eq(q.field("gameId"), gameId))
      .first();

    if (!player) throw new Error("Only players can become host");

    await ctx.db.patch(gameId, { hostId: sessionId });
  },
});

export const playAgain = mutation({
  args: { gameId: v.id("games"), sessionId: v.string() },
  handler: async (ctx, { gameId, sessionId }) => {
    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (game.hostId !== sessionId) throw new Error("Only the host can restart");

    // Delete old rounds and guesses
    const oldRounds = await ctx.db
      .query("rounds")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();
    for (const round of oldRounds) {
      const guesses = await ctx.db
        .query("guesses")
        .withIndex("by_round", (q) => q.eq("roundId", round._id))
        .collect();
      for (const guess of guesses) {
        await ctx.db.delete(guess._id);
      }
      await ctx.db.delete(round._id);
    }

    // Reset game
    await ctx.db.patch(gameId, {
      status: "lobby",
      currentRound: 0,
      teamScore: 0,
      timerEndsAt: undefined,
    });
  },
});

// Queries

export const getGameByCode = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    return ctx.db
      .query("games")
      .withIndex("by_code", (q) => q.eq("code", code.toUpperCase()))
      .first();
  },
});

export const getGame = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    return ctx.db.get(gameId);
  },
});

export const getPlayers = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    return ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();
  },
});

export const getCurrentRound = query({
  args: { gameId: v.id("games"), sessionId: v.string() },
  handler: async (ctx, { gameId, sessionId }) => {
    const game = await ctx.db.get(gameId);
    if (!game) return null;

    const round = await ctx.db
      .query("rounds")
      .withIndex("by_game_round", (q) =>
        q.eq("gameId", gameId).eq("roundIndex", game.currentRound)
      )
      .first();

    if (!round) return null;

    // Only reveal targetPosition to the clue-giver (during clue phase)
    // or when the round is in revealing/scored status
    const clueGiver = await ctx.db.get(round.clueGiverId);
    const isClueGiver = clueGiver?.sessionId === sessionId;
    const isRevealed =
      round.status === "revealing" || round.status === "scored";

    if (isClueGiver || isRevealed) {
      return round;
    }

    // Hide targetPosition from guessers
    return { ...round, targetPosition: -1 };
  },
});

export const getRounds = query({
  args: { gameId: v.id("games"), sessionId: v.string() },
  handler: async (ctx, { gameId, sessionId }) => {
    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();

    // During clue phase, each player should only see the target for their own round
    // After reveal, all targets are visible
    const results = [];
    for (const round of rounds) {
      const clueGiver = await ctx.db.get(round.clueGiverId);
      const isClueGiver = clueGiver?.sessionId === sessionId;
      const isRevealed =
        round.status === "revealing" || round.status === "scored";

      if (isClueGiver || isRevealed) {
        results.push(round);
      } else {
        results.push({ ...round, targetPosition: -1 });
      }
    }
    return results;
  },
});

export const getGuesses = query({
  args: { roundId: v.id("rounds") },
  handler: async (ctx, { roundId }) => {
    return ctx.db
      .query("guesses")
      .withIndex("by_round", (q) => q.eq("roundId", roundId))
      .collect();
  },
});

export const getMyPlayer = query({
  args: { gameId: v.id("games"), sessionId: v.string() },
  handler: async (ctx, { gameId, sessionId }) => {
    return ctx.db
      .query("players")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .filter((q) => q.eq(q.field("gameId"), gameId))
      .first();
  },
});
