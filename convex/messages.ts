import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const sendMessage = mutation({
  args: {
    gameId: v.id("games"),
    sessionId: v.string(),
    body: v.string(),
  },
  handler: async (ctx, { gameId, sessionId, body }) => {
    const trimmed = body.trim();
    if (!trimmed || trimmed.length > 200) return;

    const player = await ctx.db
      .query("players")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .filter((q) => q.eq(q.field("gameId"), gameId))
      .first();

    if (!player) throw new Error("Not a player in this game");

    await ctx.db.insert("messages", {
      gameId,
      playerId: player._id,
      playerName: player.name,
      playerColor: player.color,
      body: trimmed,
      createdAt: Date.now(),
    });
  },
});

export const getMessages = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_game_time", (q) => q.eq("gameId", gameId))
      .order("desc")
      .take(50);

    return messages.reverse();
  },
});
