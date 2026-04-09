import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

export const getUserByToken = internalQuery({
  args: { tokenIdentifier: v.string() },
  returns: v.union(v.id("users"), v.null()),
  handler: async (ctx, { tokenIdentifier }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", tokenIdentifier),
      )
      .unique();
    return user?._id ?? null;
  },
});
