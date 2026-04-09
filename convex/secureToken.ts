"use node";

import crypto from "crypto";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { getActionUserId } from "./authHelpers";

/**
 * Generate a cryptographically secure Telegram link token.
 * Uses Node.js crypto.randomBytes instead of Math.random(),
 * which Convex seeds deterministically per invocation.
 */
export const generateTelegramLinkToken = action({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const userId = await getActionUserId(ctx);
    const token = crypto.randomBytes(24).toString("base64url");
    const expiry = Date.now() + 10 * 60 * 1000; // 10 minutes

    await ctx.runMutation(internal.users.storeTelegramLinkToken, {
      userId,
      token,
      expiry,
    });

    return token;
  },
});
