import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  getAuthUserId,
  requireOwner,
  getWorkspaceContext,
} from "./authHelpers";

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

    // Revoke any existing invite for this staff member
    const existing = await ctx.db
      .query("workspaceInvites")
      .withIndex("by_workspaceId", (q) =>
        q.eq("workspaceId", wsCtx.workspaceId),
      )
      .take(100);
    for (const inv of existing) {
      if (inv.staffMemberId === staffMemberId) {
        await ctx.db.delete(inv._id);
      }
    }

    // Generate a cryptographically secure token using Web Crypto (available in Convex V8)
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const token = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "")
      .slice(0, 32);

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

    const invite = await ctx.db
      .query("workspaceInvites")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();

    if (!invite) {
      return { success: false, error: "Invalid invite link" };
    }
    if (invite.expiresAt < Date.now()) {
      await ctx.db.delete(invite._id);
      return { success: false, error: "This invite has expired" };
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
    const wsCtx = await requireOwner(ctx);
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
        token: inv.token,
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

    // Clear the removed user's active workspace (falls back to their own)
    const user = await ctx.db.get(membership.userId);
    if (user && user.activeWorkspaceId === wsCtx.workspaceId) {
      // Find their own workspace
      const ownMembership = await ctx.db
        .query("workspaceMembers")
        .withIndex("by_userId", (q) => q.eq("userId", membership.userId))
        .take(10);
      const ownWorkspace = ownMembership.find(
        (m) => m.role === "owner" && m.workspaceId !== wsCtx.workspaceId,
      );
      await ctx.db.patch(membership.userId, {
        activeWorkspaceId: ownWorkspace?.workspaceId,
      });
    }

    await ctx.db.delete(memberId);
    return null;
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
    };
  },
});
