import { v } from "convex/values";
import { mutation, internalMutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { getAuthUserId, requireOwner } from "./authHelpers";
import { PRACTICE_TEAM_PRESET } from "./practiceTeamPreset";

/** Resolve a staff row and ensure it belongs to the practice owner. */
export async function getStaffOwnedBy(
  ctx: QueryCtx | MutationCtx,
  staffId: Id<"staffMembers">,
  ownerUserId: Id<"users">,
) {
  const row = await ctx.db.get(staffId);
  if (!row || row.ownerUserId !== ownerUserId) return null;
  return row;
}

const staffDocValidator = v.object({
  _id: v.id("staffMembers"),
  _creationTime: v.number(),
  ownerUserId: v.id("users"),
  workspaceId: v.optional(v.id("workspaces")),
  name: v.string(),
  roleTitle: v.string(),
  bio: v.optional(v.string()),
  sortOrder: v.number(),
  linkedUserId: v.optional(v.id("users")),
  createdAt: v.number(),
});

const BIO_MAX = 12000;

export const listStaff = query({
  args: {},
  returns: v.array(staffDocValidator),
  handler: async (ctx) => {
    const wsCtx = await requireOwner(ctx);
    return await ctx.db
      .query("staffMembers")
      .withIndex("by_workspaceId_sortOrder", (q) =>
        q.eq("workspaceId", wsCtx.workspaceId),
      )
      .take(100);
  },
});

export const addStaff = mutation({
  args: {
    name: v.string(),
    roleTitle: v.string(),
    bio: v.optional(v.string()),
  },
  returns: v.id("staffMembers"),
  handler: async (ctx, args) => {
    const wsCtx = await requireOwner(ctx);
    const trimmedName = args.name.trim();
    const trimmedRole = args.roleTitle.trim();
    if (!trimmedName) throw new Error("Name is required");
    if (!trimmedRole) throw new Error("Role is required");
    if (trimmedName.length > 120) throw new Error("Name max 120 characters");
    if (trimmedRole.length > 120) throw new Error("Role max 120 characters");
    const bio =
      args.bio === undefined ? undefined : args.bio.trim() || undefined;
    if (bio && bio.length > BIO_MAX) throw new Error(`Bio max ${BIO_MAX} characters`);

    const MAX_STAFF = 100;
    const rows = await ctx.db
      .query("staffMembers")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", wsCtx.workspaceId))
      .take(MAX_STAFF + 1);
    if (rows.length >= MAX_STAFF) {
      throw new Error(`Maximum ${MAX_STAFF} team members`);
    }
    const maxSort = rows.reduce((m, r) => Math.max(m, r.sortOrder), 0);
    const sortOrder = maxSort > 0 ? maxSort + 1000 : 1000;

    return await ctx.db.insert("staffMembers", {
      ownerUserId: wsCtx.userId,
      workspaceId: wsCtx.workspaceId,
      name: trimmedName,
      roleTitle: trimmedRole,
      sortOrder,
      createdAt: Date.now(),
      ...(bio ? { bio } : {}),
    });
  },
});

export const updateStaff = mutation({
  args: {
    staffId: v.id("staffMembers"),
    name: v.optional(v.string()),
    roleTitle: v.optional(v.string()),
    bio: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, { staffId, name, roleTitle, bio }) => {
    const wsCtx = await requireOwner(ctx);
    const row = await getStaffOwnedBy(ctx, staffId, wsCtx.userId);
    if (!row) throw new Error("Staff member not found");

    const patch: Partial<{
      name: string;
      roleTitle: string;
      bio: string;
    }> = {};
    if (name !== undefined) {
      const t = name.trim();
      if (!t) throw new Error("Name is required");
      if (t.length > 120) throw new Error("Name max 120 characters");
      patch.name = t;
    }
    if (roleTitle !== undefined) {
      const t = roleTitle.trim();
      if (!t) throw new Error("Role is required");
      if (t.length > 120) throw new Error("Role max 120 characters");
      patch.roleTitle = t;
    }
    if (bio !== undefined) {
      if (bio === null) {
        patch.bio = undefined;
      } else {
        const t = bio.trim();
        if (t.length > BIO_MAX) throw new Error(`Bio max ${BIO_MAX} characters`);
        patch.bio = t || undefined;
      }
    }
    if (Object.keys(patch).length === 0) return null;
    await ctx.db.patch(staffId, patch);
    return null;
  },
});

export const deleteStaff = mutation({
  args: { staffId: v.id("staffMembers") },
  returns: v.null(),
  handler: async (ctx, { staffId }) => {
    const wsCtx = await requireOwner(ctx);
    const row = await getStaffOwnedBy(ctx, staffId, wsCtx.userId);
    if (!row) throw new Error("Staff member not found");

    const BATCH = 100;
    const assigned = await ctx.db
      .query("tasks")
      .withIndex("by_workspaceId_assignedStaffId", (q) =>
        q.eq("workspaceId", wsCtx.workspaceId).eq("assignedStaffId", staffId),
      )
      .take(BATCH + 1);

    for (const t of assigned.slice(0, BATCH)) {
      await ctx.db.patch(t._id, { assignedStaffId: undefined });
    }

    if (assigned.length > BATCH) {
      await ctx.scheduler.runAfter(0, internal.staff.clearStaffFromTasks, {
        workspaceId: wsCtx.workspaceId,
        staffId,
        deleteWhenDone: true,
      });
    } else {
      await ctx.db.delete(staffId);
    }
    return null;
  },
});

/** Continuation: clear assignedStaffId from remaining tasks after staff deletion. */
export const clearStaffFromTasks = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    staffId: v.id("staffMembers"),
    deleteWhenDone: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { workspaceId, staffId, deleteWhenDone }) => {
    const BATCH = 100;
    const assigned = await ctx.db
      .query("tasks")
      .withIndex("by_workspaceId_assignedStaffId", (q) =>
        q.eq("workspaceId", workspaceId).eq("assignedStaffId", staffId),
      )
      .take(BATCH + 1);

    for (const t of assigned.slice(0, BATCH)) {
      await ctx.db.patch(t._id, { assignedStaffId: undefined });
    }

    if (assigned.length > BATCH) {
      await ctx.scheduler.runAfter(0, internal.staff.clearStaffFromTasks, {
        workspaceId,
        staffId,
        deleteWhenDone,
      });
    } else if (deleteWhenDone) {
      const staffRow = await ctx.db.get(staffId);
      if (staffRow) {
        await ctx.db.delete(staffId);
      }
    }
    return null;
  },
});

export const reorderStaff = mutation({
  args: {
    orderedIds: v.array(v.id("staffMembers")),
  },
  returns: v.null(),
  handler: async (ctx, { orderedIds }) => {
    const wsCtx = await requireOwner(ctx);

    const allRows = await ctx.db
      .query("staffMembers")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", wsCtx.workspaceId))
      .take(101);
    if (allRows.length > 100) {
      throw new Error(
        "Team exceeds 100 members; reorder is not supported. Remove members or split the roster.",
      );
    }

    if (orderedIds.length !== allRows.length) {
      throw new Error("Reorder must include every team member exactly once.");
    }

    const allIds = new Set(allRows.map((r) => r._id));
    const seen = new Set<string>();
    for (const id of orderedIds) {
      if (seen.has(id)) throw new Error("Duplicate id in order");
      seen.add(id);
      if (!allIds.has(id)) throw new Error("Invalid team member in order");
    }

    let order = 1000;
    for (const id of orderedIds) {
      await ctx.db.patch(id, { sortOrder: order });
      order += 1000;
    }
    return null;
  },
});

/** Inserts the bundled practice roster + bios only when you have zero team members. */
export const seedPresetTeamIfEmpty = mutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const wsCtx = await requireOwner(ctx);
    const existing = await ctx.db
      .query("staffMembers")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", wsCtx.workspaceId))
      .take(1);
    if (existing.length > 0) {
      throw new Error(
        "Your team already has members. Remove them first if you want to load the preset roster.",
      );
    }

    let order = 1000;
    const now = Date.now();
    for (const row of PRACTICE_TEAM_PRESET) {
      await ctx.db.insert("staffMembers", {
        ownerUserId: wsCtx.userId,
        workspaceId: wsCtx.workspaceId,
        name: row.name,
        roleTitle: row.roleTitle,
        bio: row.bio,
        sortOrder: order,
        createdAt: now,
      });
      order += 1000;
    }
    return PRACTICE_TEAM_PRESET.length;
  },
});
