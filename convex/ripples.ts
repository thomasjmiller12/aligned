import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";

// Players call this to broadcast a touch/swipe ripple
export const addRipple = mutation({
  args: {
    gameId: v.id("games"),
    playerId: v.id("players"),
    x: v.number(),
    y: v.number(),
    color: v.string(),
  },
  handler: async (ctx, { gameId, playerId, x, y, color }) => {
    await ctx.db.insert("ripples", {
      gameId,
      playerId,
      x,
      y,
      color,
      createdAt: Date.now(),
    });
  },
});

// Reactive query — returns ripples from the last 4 seconds
export const getRecentRipples = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const cutoff = Date.now() - 4000;
    const ripples = await ctx.db
      .query("ripples")
      .withIndex("by_game_time", (q) =>
        q.eq("gameId", gameId).gte("createdAt", cutoff)
      )
      .collect();
    return ripples;
  },
});

// Scheduled cleanup — delete ripples older than 10 seconds
export const cleanupRipples = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 10000;
    const oldRipples = await ctx.db
      .query("ripples")
      .filter((q) => q.lt(q.field("createdAt"), cutoff))
      .collect();
    for (const ripple of oldRipples) {
      await ctx.db.delete(ripple._id);
    }
  },
});
