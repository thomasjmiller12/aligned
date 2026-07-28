import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { getRandomSpectrums } from "./spectrums";
import { scoreGuess } from "./scoring";

const PLAYER_COLORS = [
  "#E8553A",
  "#2A9D8F",
  "#7C3AED",
  "#F59E0B",
  "#EC4899",
  "#06B6D4",
  "#84CC16",
  "#F97316",
  "#8B5CF6",
  "#14B8A6",
  "#DC2626",
  "#0EA5E9",
  "#D946EF",
  "#65A30D",
  "#0891B2",
  "#E11D48",
];

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

const ALLOWED_REACTION_EMOJIS = ["💩", "💀", "🌈"];

export const createGame = mutation({
  args: { hostName: v.string(), sessionId: v.string() },
  handler: async (ctx, { hostName, sessionId }) => {
    const trimmedName = hostName.trim().slice(0, 20);
    if (!trimmedName) throw new Error("Name can't be empty");

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

    if (existing) {
      // Retire the finished game's code so by_code resolves to exactly the new game.
      await ctx.db.patch(existing._id, { code: `${code}_retired_${existing._id}` });
    }

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
      name: trimmedName,
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
    const trimmedName = playerName.trim().slice(0, 20);
    if (!trimmedName) throw new Error("Name can't be empty");

    const game = await ctx.db
      .query("games")
      .withIndex("by_code", (q) => q.eq("code", code.toUpperCase()))
      .first();

    if (!game) throw new Error("Game not found");

    const isMidGame = game.status !== "lobby";

    // Check if player already in game (reconnecting)
    const existingPlayer = await ctx.db
      .query("players")
      .withIndex("by_game_session", (q) =>
        q.eq("gameId", game._id).eq("sessionId", sessionId)
      )
      .first();

    if (existingPlayer) {
      await ctx.db.patch(existingPlayer._id, { isConnected: true });
      return { gameId: game._id, playerId: existingPlayer._id };
    }

    const players = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect();

    if (players.length >= 16) throw new Error("Game is full (max 16 players)");

    const playerId = await ctx.db.insert("players", {
      gameId: game._id,
      sessionId,
      name: trimmedName,
      color: PLAYER_COLORS[players.length % PLAYER_COLORS.length],
      order: players.length,
      isConnected: true,
      ...(isMidGame ? { isSpectator: true } : {}),
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
    const shuffled = shuffle(players);
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
      { gameId, deadline: timerEndsAt }
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
    const trimmed = clue.trim().slice(0, 250);
    if (!trimmed) throw new Error("Clue can't be empty");

    const round = await ctx.db.get(roundId);
    if (!round) throw new Error("Round not found");

    const player = await ctx.db.get(round.clueGiverId);
    if (!player || player.sessionId !== sessionId) {
      throw new Error("Not your round to give a clue");
    }

    await ctx.db.patch(roundId, { clue: trimmed, status: "clue_given" });
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
      .withIndex("by_game_session", (q) =>
        q.eq("gameId", round.gameId).eq("sessionId", sessionId)
      )
      .first();

    if (!player) throw new Error("Player not found");
    if (player.isSpectator) throw new Error("Spectators can't guess");
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
      .withIndex("by_game_session", (q) =>
        q.eq("gameId", round.gameId).eq("sessionId", sessionId)
      )
      .first();

    if (!player) throw new Error("Player not found");
    if (player.isSpectator) throw new Error("Spectators can't guess");

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
    const totalGuessers = players.filter((p) => !p.isSpectator).length - 1; // exclude clue giver and spectators

    const allGuesses = await ctx.db
      .query("guesses")
      .withIndex("by_round", (q) => q.eq("roundId", roundId))
      .collect();
    const lockedCount = allGuesses.filter((g) => g.lockedIn).length;

    if (lockedCount >= totalGuessers && totalGuessers > 0) {
      // Everyone locked — auto-reveal
      let roundScore = 0;
      for (const g of allGuesses) {
        roundScore += scoreGuess(g.position, round.targetPosition);
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

export const unlockGuess = mutation({
  args: { roundId: v.id("rounds"), sessionId: v.string() },
  handler: async (ctx, { roundId, sessionId }) => {
    const round = await ctx.db.get(roundId);
    if (!round) throw new Error("Round not found");
    if (round.status !== "guessing") {
      throw new Error("Round is no longer accepting changes");
    }

    const game = await ctx.db.get(round.gameId);
    if (!game || game.status !== "guessing") {
      throw new Error("Game is no longer accepting changes");
    }

    const player = await ctx.db
      .query("players")
      .withIndex("by_game_session", (q) =>
        q.eq("gameId", round.gameId).eq("sessionId", sessionId)
      )
      .first();
    if (!player) throw new Error("Player not found");
    if (player._id === round.clueGiverId) {
      throw new Error("Clue-giver has no guess to unlock");
    }

    const guess = await ctx.db
      .query("guesses")
      .withIndex("by_round_player", (q) =>
        q.eq("roundId", roundId).eq("playerId", player._id)
      )
      .first();
    if (!guess) throw new Error("No guess to unlock");
    if (!guess.lockedIn) return;

    await ctx.db.patch(guess._id, { lockedIn: false });
  },
});

export const advanceToGuessing = mutation({
  args: { gameId: v.id("games"), sessionId: v.string() },
  handler: async (ctx, { gameId, sessionId }) => {
    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (game.hostId !== sessionId) throw new Error("Only the host can advance");
    if (game.status !== "clue_phase") return; // Already advanced or wrong state

    // Find the first round that has a clue submitted
    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();

    const firstCluedRound = rounds
      .sort((a, b) => a.roundIndex - b.roundIndex)
      .find(
        (r) => r.clue && (r.status === "pending" || r.status === "clue_given")
      );

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

    let roundScore = 0;
    for (const guess of guesses) {
      roundScore += scoreGuess(guess.position, round.targetPosition);
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

    // Mark genuinely skipped rounds (no clue) as scored. Rounds that DO have a
    // clue and are still ahead of us must be left alone: marking them scored
    // here made getRounds treat them as revealed and hand their targetPosition
    // to every client before the round was even played.
    for (const r of rounds) {
      if (
        r.roundIndex > game.currentRound &&
        r.status !== "scored" &&
        !r.clue
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

export const updatePlayerColor = mutation({
  args: {
    gameId: v.id("games"),
    sessionId: v.string(),
    color: v.string(),
  },
  handler: async (ctx, { gameId, sessionId, color }) => {
    if (!PLAYER_COLORS.includes(color)) {
      throw new Error("Invalid color");
    }

    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "lobby") {
      throw new Error("Color can only be changed in the lobby");
    }

    const player = await ctx.db
      .query("players")
      .withIndex("by_game_session", (q) =>
        q.eq("gameId", gameId).eq("sessionId", sessionId)
      )
      .first();
    if (!player) throw new Error("Player not in this game");

    await ctx.db.patch(player._id, { color });
  },
});

export const updatePlayerName = mutation({
  args: {
    gameId: v.id("games"),
    sessionId: v.string(),
    name: v.string(),
  },
  handler: async (ctx, { gameId, sessionId, name }) => {
    const trimmed = name.trim().slice(0, 20);
    if (!trimmed) throw new Error("Name can't be empty");

    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "lobby") {
      throw new Error("Name can only be changed in the lobby");
    }

    const player = await ctx.db
      .query("players")
      .withIndex("by_game_session", (q) =>
        q.eq("gameId", gameId).eq("sessionId", sessionId)
      )
      .first();
    if (!player) throw new Error("Player not in this game");

    await ctx.db.patch(player._id, { name: trimmed });
  },
});

export const kickPlayer = mutation({
  args: {
    gameId: v.id("games"),
    sessionId: v.string(),
    playerId: v.id("players"),
  },
  handler: async (ctx, { gameId, sessionId, playerId }) => {
    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (game.hostId !== sessionId) throw new Error("Only the host can kick players");
    if (game.status !== "lobby") throw new Error("Can only kick players in the lobby");

    const player = await ctx.db.get(playerId);
    if (!player || player.gameId !== gameId) throw new Error("Player not found in this game");
    if (player.sessionId === sessionId) throw new Error("Cannot kick yourself");

    // Delete presence data
    const presence = await ctx.db
      .query("presence")
      .withIndex("by_game_player", (q) => q.eq("gameId", gameId).eq("playerId", playerId))
      .first();
    if (presence) {
      await ctx.db.delete(presence._id);
    }

    // Delete the player
    await ctx.db.delete(playerId);
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

    // Delete chat messages
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_game_time", (q) => q.eq("gameId", gameId))
      .collect();
    for (const msg of messages) {
      await ctx.db.delete(msg._id);
    }

    // Delete reactions
    const reactions = await ctx.db
      .query("reactions")
      .withIndex("by_game_time", (q) => q.eq("gameId", gameId))
      .collect();
    for (const reaction of reactions) {
      await ctx.db.delete(reaction._id);
    }

    // Promote spectators to full players
    const players = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();
    for (const player of players) {
      if (player.isSpectator) {
        await ctx.db.patch(player._id, { isSpectator: false });
      }
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

export const getPlayerScores = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();

    const scores: Record<string, number> = {};

    for (const round of rounds) {
      if (round.status !== "revealing" && round.status !== "scored") continue;
      const guesses = await ctx.db
        .query("guesses")
        .withIndex("by_round", (q) => q.eq("roundId", round._id))
        .collect();

      for (const guess of guesses) {
        const pid = guess.playerId as string;
        scores[pid] =
          (scores[pid] ?? 0) + scoreGuess(guess.position, round.targetPosition);
      }
    }
    return scores;
  },
});

/**
 * How well each player's clue landed: the points their round's guessers earned,
 * out of what was available. Used for the "Best Clues" board at game over.
 * Ranked by accuracy rather than raw points so a round with fewer guessers
 * (late joiner, someone who never locked in) isn't unfairly penalised.
 */
export const getClueScores = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();

    const byGiver: Record<
      string,
      {
        clueGiverId: string;
        clues: string[];
        points: number;
        maxPoints: number;
        bullseyes: number;
      }
    > = {};
    // Per-round totals, for the chronological recap list.
    const byRound: Record<string, { points: number; maxPoints: number }> = {};

    for (const round of rounds) {
      if (round.status !== "revealing" && round.status !== "scored") continue;
      if (!round.clue) continue; // skipped rounds don't count for or against

      const guesses = await ctx.db
        .query("guesses")
        .withIndex("by_round", (q) => q.eq("roundId", round._id))
        .collect();

      const giverId = round.clueGiverId as string;
      const entry = (byGiver[giverId] ??= {
        clueGiverId: giverId,
        clues: [],
        points: 0,
        maxPoints: 0,
        bullseyes: 0,
      });

      entry.clues.push(round.clue);
      entry.maxPoints += guesses.length * 4;

      let roundPoints = 0;
      for (const guess of guesses) {
        const pts = scoreGuess(guess.position, round.targetPosition);
        roundPoints += pts;
        if (pts === 4) entry.bullseyes++;
      }
      entry.points += roundPoints;
      byRound[round._id] = {
        points: roundPoints,
        maxPoints: guesses.length * 4,
      };
    }

    const byPlayer = Object.values(byGiver).sort((a, b) => {
      const aPct = a.maxPoints > 0 ? a.points / a.maxPoints : 0;
      const bPct = b.maxPoints > 0 ? b.points / b.maxPoints : 0;
      if (bPct !== aPct) return bPct - aPct;
      return b.points - a.points;
    });

    return { byPlayer, byRound };
  },
});

// Reactions

export const sendReaction = mutation({
  args: {
    gameId: v.id("games"),
    sessionId: v.string(),
    emoji: v.string(),
  },
  handler: async (ctx, { gameId, sessionId, emoji }) => {
    if (!ALLOWED_REACTION_EMOJIS.includes(emoji)) {
      throw new Error("Invalid emoji");
    }

    const player = await ctx.db
      .query("players")
      .withIndex("by_game_session", (q) =>
        q.eq("gameId", gameId).eq("sessionId", sessionId)
      )
      .first();
    if (!player) throw new Error("Player not found");

    // Rate limit: max 50 reactions per second per player
    const recent = await ctx.db
      .query("reactions")
      .withIndex("by_game_time", (q) => q.eq("gameId", gameId))
      .order("desc")
      .filter((q) => q.eq(q.field("playerId"), player._id))
      .take(50);
    if (recent.length >= 50 && Date.now() - recent[49].createdAt < 1000) return;

    await ctx.db.insert("reactions", {
      gameId,
      playerId: player._id,
      playerName: player.name,
      playerColor: player.color,
      emoji,
      createdAt: Date.now(),
    });
  },
});

export const getReactions = query({
  // sessionId is accepted but unused: keying the subscription on gameId alone
  // means every client in a game shares one query result, so an insert re-runs
  // this once instead of once per player. Callers filter out their own
  // reactions (which they render optimistically) client-side.
  args: { gameId: v.id("games"), sessionId: v.optional(v.string()) },
  handler: async (ctx, { gameId }) => {
    // Short window: the longest reaction animation is ~4s, so anything older
    // is already discarded by the client. Keeping this tight keeps the payload
    // small when a lobby is spamming emoji.
    const cutoff = Date.now() - 6_000;
    return ctx.db
      .query("reactions")
      .withIndex("by_game_time", (q) =>
        q.eq("gameId", gameId).gte("createdAt", cutoff)
      )
      .order("desc")
      .take(40);
  },
});

export const getMyPlayer = query({
  args: { gameId: v.id("games"), sessionId: v.string() },
  handler: async (ctx, { gameId, sessionId }) => {
    return ctx.db
      .query("players")
      .withIndex("by_game_session", (q) =>
        q.eq("gameId", gameId).eq("sessionId", sessionId)
      )
      .first();
  },
});
