import { QueryCtx, MutationCtx, ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id, Doc } from "./_generated/dataModel";

// ── Crypto helpers ───────────────────────────────────

/**
 * Generates a cryptographically secure 32-char base64url token.
 * 24 random bytes → 32 base64url chars with no padding.
 */
export function generateSecureToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

// ── Workspace context types ──────────────────────────

export type WorkspaceRole = "owner" | "member";

export interface WorkspaceContext {
  userId: Id<"users">;
  workspaceId: Id<"workspaces">;
  role: WorkspaceRole;
  /** Set when role === "member" and the user is linked to a staff roster entry. */
  staffMemberId: Id<"staffMembers"> | null;
}

/**
 * Get the authenticated user's ID from the users table.
 * Works in queries and mutations (anything with ctx.db).
 * Throws if not authenticated or user not found.
 */
export async function getAuthUserId(ctx: QueryCtx): Promise<Id<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  const user = await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique();

  if (!user) throw new Error("User not found");
  return user._id;
}

/**
 * Get the authenticated user's ID for use in actions.
 * Actions don't have ctx.db, so this uses ctx.runQuery internally.
 * Throws if not authenticated.
 */
export async function getActionUserId(ctx: ActionCtx): Promise<Id<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  const userId = await ctx.runQuery(internal.authInternal.getUserByToken, {
    tokenIdentifier: identity.tokenIdentifier,
  });
  if (!userId) throw new Error("User not found");
  return userId;
}

/**
 * Store or update the user from their identity.
 * Called when a user signs in to ensure they have a record in the users table.
 * Skips the patch if name and email are already up to date (avoids unnecessary
 * write transactions that would invalidate reactive query subscriptions).
 */
export async function storeUser(ctx: MutationCtx): Promise<Id<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  const existing = await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique();

  if (existing) {
    if (existing.name !== identity.name || existing.email !== identity.email) {
      await ctx.db.patch(existing._id, {
        name: identity.name,
        email: identity.email,
      });
    }
    // Provision workspace for existing users who don't have one yet (migration)
    if (!existing.activeWorkspaceId) {
      await provisionWorkspace(ctx, existing._id, identity.name);
    }
    return existing._id;
  }

  const userId = await ctx.db.insert("users", {
    tokenIdentifier: identity.tokenIdentifier,
    name: identity.name,
    email: identity.email,
    createdAt: Date.now(),
  });

  // Every new user gets their own workspace automatically
  await provisionWorkspace(ctx, userId, identity.name);

  return userId;
}

/**
 * Create a workspace + owner membership for a user who doesn't have one.
 * Sets the user's activeWorkspaceId. Idempotent — checks first.
 */
async function provisionWorkspace(
  ctx: MutationCtx,
  userId: Id<"users">,
  name: string | undefined,
): Promise<Id<"workspaces">> {
  const now = Date.now();
  const workspaceName = name ? `${name}'s Practice` : "My Practice";

  const workspaceId = await ctx.db.insert("workspaces", {
    name: workspaceName,
    ownerUserId: userId,
    createdAt: now,
  });

  await ctx.db.insert("workspaceMembers", {
    workspaceId,
    userId,
    role: "owner",
    joinedAt: now,
  });

  await ctx.db.patch(userId, { activeWorkspaceId: workspaceId });

  return workspaceId;
}

// ── Workspace-aware auth ─────────────────────────────

/**
 * Get the authenticated user's workspace context.
 * Returns userId, workspaceId, role, and staffMemberId (for members).
 * Throws if not authenticated, user not found, or no active workspace.
 *
 * During migration (Phase 1-2), callers that don't need workspace scoping
 * should continue using `getAuthUserId` instead.
 */
export async function getWorkspaceContext(
  ctx: QueryCtx,
): Promise<WorkspaceContext> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  const user = await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique();
  if (!user) throw new Error("User not found");

  const workspaceId = user.activeWorkspaceId;
  if (!workspaceId) throw new Error("No active workspace");

  const membership = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_workspaceId_userId", (q) =>
      q.eq("workspaceId", workspaceId).eq("userId", user._id),
    )
    .unique();
  if (!membership) throw new Error("Not a member of active workspace");

  let staffMemberId: Id<"staffMembers"> | null = null;
  if (membership.role === "member") {
    const staffMember = await ctx.db
      .query("staffMembers")
      .withIndex("by_linkedUserId", (q) =>
        q.eq("linkedUserId", user._id),
      )
      .unique();
    if (staffMember && staffMember.workspaceId === workspaceId) {
      staffMemberId = staffMember._id;
    }
  }

  return {
    userId: user._id,
    workspaceId,
    role: membership.role,
    staffMemberId,
  };
}

// ── Permission helpers ───────────────────────────────

/** Throws if the caller is not an owner. Use for mutations that only owners can perform. */
export async function requireOwner(ctx: QueryCtx): Promise<WorkspaceContext> {
  const wsCtx = await getWorkspaceContext(ctx);
  if (wsCtx.role !== "owner") {
    throw new Error("Owner access required");
  }
  return wsCtx;
}

/** Can this user update a task's status (Todo/InProgress/Done)? Owner always; member if assigned. */
export function canUpdateTaskStatus(
  wsCtx: WorkspaceContext,
  task: Doc<"tasks">,
): boolean {
  if (wsCtx.role === "owner") return true;
  return (
    wsCtx.staffMemberId !== null &&
    task.assignedStaffId === wsCtx.staffMemberId
  );
}

/** Can this user toggle subtasks on a task? Same rules as status updates. */
export function canToggleSubtask(
  wsCtx: WorkspaceContext,
  task: Doc<"tasks">,
): boolean {
  return canUpdateTaskStatus(wsCtx, task);
}
