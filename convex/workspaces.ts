import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  getAuthUserId,
  requireOwner,
  getWorkspaceContext,
  generateSecureToken,
} from "./authHelpers";
import { enforceRateLimit } from "./rateLimit";
import { workspaceRoleValidator } from "./schema";

// ── Invite generation ───────────────────────────────

export const generateInvite = mutation({
  args: { staffMemberId: v.id("staffMembers") },
  returns: v.string(),
  handler: async (ctx, { staffMemberId }) => {
    const wsCtx = await requireOwner(ctx);

    const staff = await ctx.db.get(staffMemberId);
    if (!staff || staff.workspaceId !== wsCtx.workspaceId) {
      throw new Error("Staff member not found");
    }
    if (staff.linkedUserId) {
      throw new Error("Staff member already has a linked account");
    }

    // Revoke any existing invite for this staff member using the composite index
    const existing = await ctx.db
      .query("workspaceInvites")
      .withIndex("by_workspaceId_staffMemberId", (q) =>
        q.eq("workspaceId", wsCtx.workspaceId).eq("staffMemberId", staffMemberId),
      )
      .take(5);
    for (const inv of existing) {
      await ctx.db.delete(inv._id);
    }

    const token = generateSecureToken();

    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    await ctx.db.insert("workspaceInvites", {
      workspaceId: wsCtx.workspaceId,
      staffMemberId,
      token,
      expiresAt: Date.now() + SEVEN_DAYS,
      createdBy: wsCtx.userId,
    });

    return token;
  },
});

// ── Invite consumption ──────────────────────────────

export const consumeInvite = mutation({
  args: { token: v.string() },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, { token }) => {
    // Validate format before hitting the DB (32 base64url chars)
    if (!/^[A-Za-z0-9_-]{32}$/.test(token)) {
      return { success: false, error: "Invalid invite link" };
    }

    const userId = await getAuthUserId(ctx);
    await enforceRateLimit(ctx, userId, "consumeInvite", 10_000);

    const invite = await ctx.db
      .query("workspaceInvites")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();

    // Return the same error for both "not found" and "expired" to prevent
    // timing-based enumeration of token existence.
    if (!invite) {
      return { success: false, error: "Invalid invite link" };
    }
    if (invite.expiresAt < Date.now()) {
      await ctx.db.delete(invite._id);
      return { success: false, error: "Invalid invite link" };
    }

    // Check if user is already a member
    const existingMembership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspaceId_userId", (q) =>
        q.eq("workspaceId", invite.workspaceId).eq("userId", userId),
      )
      .unique();

    if (existingMembership) {
      await ctx.db.delete(invite._id);
      return { success: true }; // Idempotent
    }

    // Create membership
    await ctx.db.insert("workspaceMembers", {
      workspaceId: invite.workspaceId,
      userId,
      role: "member",
      joinedAt: Date.now(),
    });

    // Link staff member to this user
    const staff = await ctx.db.get(invite.staffMemberId);
    if (staff) {
      await ctx.db.patch(invite.staffMemberId, { linkedUserId: userId });
    }

    // Switch user's active workspace
    await ctx.db.patch(userId, {
      activeWorkspaceId: invite.workspaceId,
    });

    // Delete consumed invite (single-use)
    await ctx.db.delete(invite._id);

    return { success: true };
  },
});

// ── Invite management (owner) ───────────────────────

export const revokeInvite = mutation({
  args: { inviteId: v.id("workspaceInvites") },
  returns: v.null(),
  handler: async (ctx, { inviteId }) => {
    const wsCtx = await requireOwner(ctx);
    const invite = await ctx.db.get(inviteId);
    if (!invite || invite.workspaceId !== wsCtx.workspaceId) {
      throw new Error("Invite not found");
    }
    await ctx.db.delete(inviteId);
    return null;
  },
});

export const listInvites = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("workspaceInvites"),
      staffMemberId: v.id("staffMembers"),
      token: v.string(),
      expiresAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    let wsCtx;
    try {
      wsCtx = await requireOwner(ctx);
    } catch {
      return [];
    }
    const invites = await ctx.db
      .query("workspaceInvites")
      .withIndex("by_workspaceId", (q) =>
        q.eq("workspaceId", wsCtx.workspaceId),
      )
      .take(100);

    const now = Date.now();
    return invites
      .filter((inv) => inv.expiresAt > now)
      .map((inv) => ({
        _id: inv._id,
        staffMemberId: inv.staffMemberId,
        // Return only a masked prefix — the full token is only needed at
        // generation time (returned directly by generateInvite).
        token: inv.token.slice(0, 6) + "…",
        expiresAt: inv.expiresAt,
      }));
  },
});

// ── Member management ───────────────────────────────

export const removeMember = mutation({
  args: { memberId: v.id("workspaceMembers") },
  returns: v.null(),
  handler: async (ctx, { memberId }) => {
    const wsCtx = await requireOwner(ctx);
    const membership = await ctx.db.get(memberId);
    if (!membership || membership.workspaceId !== wsCtx.workspaceId) {
      throw new Error("Member not found");
    }
    if (membership.role === "owner") {
      throw new Error("Cannot remove the workspace owner");
    }

    // Unlink staff member
    const staff = await ctx.db
      .query("staffMembers")
      .withIndex("by_linkedUserId", (q) =>
        q.eq("linkedUserId", membership.userId),
      )
      .unique();
    if (staff && staff.workspaceId === wsCtx.workspaceId) {
      await ctx.db.patch(staff._id, { linkedUserId: undefined });
    }

    // Fall back to the evicted user's own owner workspace.
    // Only patch if a fallback was found — if none exists, storeUser will
    // provision a new workspace on the user's next login.
    const user = await ctx.db.get(membership.userId);
    if (user && user.activeWorkspaceId === wsCtx.workspaceId) {
      const ownMemberships = await ctx.db
        .query("workspaceMembers")
        .withIndex("by_userId", (q) => q.eq("userId", membership.userId))
        .take(10);
      const ownWorkspace = ownMemberships.find(
        (m) => m.role === "owner" && m.workspaceId !== wsCtx.workspaceId,
      );
      if (ownWorkspace) {
        await ctx.db.patch(membership.userId, {
          activeWorkspaceId: ownWorkspace.workspaceId,
        });
      }
    }

    await ctx.db.delete(memberId);
    return null;
  },
});

// ── Member listing ──────────────────────────────────

export const listMembers = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("workspaceMembers"),
      userId: v.id("users"),
      role: workspaceRoleValidator,
      joinedAt: v.number(),
      name: v.optional(v.string()),
      email: v.optional(v.string()),
    }),
  ),
  handler: async (ctx) => {
    const wsCtx = await requireOwner(ctx);
    const members = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", wsCtx.workspaceId))
      .take(100);
    return await Promise.all(
      members.map(async (m) => {
        const user = await ctx.db.get(m.userId);
        return {
          _id: m._id,
          userId: m.userId,
          role: m.role,
          joinedAt: m.joinedAt,
          name: user?.name,
          email: user?.email,
        };
      }),
    );
  },
});

// ── Workspace info ──────────────────────────────────

export const getWorkspaceInfo = query({
  args: {},
  returns: v.union(
    v.object({
      _id: v.id("workspaces"),
      name: v.string(),
      role: v.union(v.literal("owner"), v.literal("member")),
      telegramBotUsername: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    let wsCtx;
    try {
      wsCtx = await getWorkspaceContext(ctx);
    } catch {
      return null;
    }
    const workspace = await ctx.db.get(wsCtx.workspaceId);
    if (!workspace) return null;
    return {
      _id: workspace._id,
      name: workspace.name,
      role: wsCtx.role,
      telegramBotUsername: workspace.telegramBotUsername,
    };
  },
});

// ── Workspace settings update ───────────────────────

export const updateWorkspaceName = mutation({
  args: { name: v.string() },
  returns: v.null(),
  handler: async (ctx, { name }) => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Workspace name cannot be empty");
    if (trimmed.length > 100) throw new Error("Workspace name too long");
    const wsCtx = await requireOwner(ctx);
    await ctx.db.patch(wsCtx.workspaceId, { name: trimmed });
    return null;
  },
});

export const updateTelegramBotUsername = mutation({
  args: { username: v.string() },
  returns: v.null(),
  handler: async (ctx, { username }) => {
    // Strip leading @ if user pastes it with the @
    const clean = username.trim().replace(/^@/, "");
    if (clean.length > 100) throw new Error("Bot username too long");
    const wsCtx = await requireOwner(ctx);
    await ctx.db.patch(wsCtx.workspaceId, {
      telegramBotUsername: clean || undefined,
    });
    return null;
  },
});
