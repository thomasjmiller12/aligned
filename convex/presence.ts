import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";

// Upsert player cursor position (called ~7-10x/sec during active interaction)
export const updatePresence = mutation({
  args: {
    gameId: v.id("games"),
    playerId: v.id("players"),
    x: v.number(),
    y: v.number(),
    color: v.string(),
    burst: v.optional(v.boolean()),
  },
  handler: async (ctx, { gameId, playerId, x, y, color, burst }) => {
    const existing = await ctx.db
      .query("presence")
      .withIndex("by_game_player", (q) =>
        q.eq("gameId", gameId).eq("playerId", playerId)
      )
      .unique();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        x,
        y,
        color,
        updatedAt: now,
        ...(burst ? { burstAt: now } : {}),
      });
    } else {
      await ctx.db.insert("presence", {
        gameId,
        playerId,
        x,
        y,
        color,
        updatedAt: now,
        ...(burst ? { burstAt: now } : {}),
      });
    }
  },
});

// Get all active presence for a game (reactive)
export const getPresence = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const cutoff = Date.now() - 5000; // only active within last 5s
    const all = await ctx.db
      .query("presence")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();
    return all.filter((p) => p.updatedAt > cutoff);
  },
});

// Cleanup stale presence records
export const cleanupPresence = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 15000;
    const stale = await ctx.db
      .query("presence")
      .filter((q) => q.lt(q.field("updatedAt"), cutoff))
      .collect();
    for (const record of stale) {
      await ctx.db.delete(record._id);
    }
  },
});
