import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  games: defineTable({
    code: v.string(),
    hostId: v.string(),
    status: v.union(
      v.literal("lobby"),
      v.literal("clue_phase"),
      v.literal("guessing"),
      v.literal("revealing"),
      v.literal("game_over")
    ),
    currentRound: v.number(),
    teamScore: v.number(),
    settings: v.object({
      clueTimerSeconds: v.number(),
      guessTimerSeconds: v.number(),
    }),
    timerEndsAt: v.optional(v.number()),
  })
    .index("by_code", ["code"])
    .index("by_status", ["status"]),

  players: defineTable({
    gameId: v.id("games"),
    sessionId: v.string(),
    name: v.string(),
    color: v.string(),
    order: v.number(),
    isConnected: v.boolean(),
  })
    .index("by_game", ["gameId"])
    .index("by_session", ["sessionId"]),

  rounds: defineTable({
    gameId: v.id("games"),
    roundIndex: v.number(),
    clueGiverId: v.id("players"),
    spectrumLeft: v.string(),
    spectrumRight: v.string(),
    targetPosition: v.number(),
    clue: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("clue_given"),
      v.literal("guessing"),
      v.literal("revealing"),
      v.literal("scored")
    ),
  })
    .index("by_game", ["gameId"])
    .index("by_game_round", ["gameId", "roundIndex"]),

  guesses: defineTable({
    roundId: v.id("rounds"),
    playerId: v.id("players"),
    position: v.number(),
    lockedIn: v.boolean(),
  })
    .index("by_round", ["roundId"])
    .index("by_round_player", ["roundId", "playerId"]),

  ripples: defineTable({
    gameId: v.id("games"),
    playerId: v.id("players"),
    x: v.number(),        // 0-1 normalized screen position
    y: v.number(),        // 0-1 normalized screen position
    color: v.string(),    // player's hex color
    createdAt: v.number(), // Date.now() timestamp
  })
    .index("by_game", ["gameId"])
    .index("by_game_time", ["gameId", "createdAt"]),
});
