import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

const BATCH_SIZE = 50;

/**
 * Phase 2 migration: backfill workspaceId on all existing data.
 *
 * For each user without activeWorkspaceId:
 *   1. Create workspace + workspaceMember (owner)
 *   2. Set user.activeWorkspaceId
 *   3. Stamp workspaceId on tasks, staffMembers, subtasks, taskTemplates, taskAttachments
 *
 * Uses batched continuation to stay within transaction limits.
 * Run from Convex dashboard: `npx convex run migrations:migrateAllUsers`
 */
export const migrateAllUsers = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    // Find users without an active workspace
    const users = await ctx.db.query("users").take(BATCH_SIZE);

    let migratedCount = 0;
    for (const user of users) {
      if (!user.activeWorkspaceId) {
        const now = Date.now();
        const workspaceName = user.name
          ? `${user.name}'s Practice`
          : "My Practice";

        const workspaceId = await ctx.db.insert("workspaces", {
          name: workspaceName,
          ownerUserId: user._id,
          createdAt: now,
        });

        await ctx.db.insert("workspaceMembers", {
          workspaceId,
          userId: user._id,
          role: "owner",
          joinedAt: now,
        });

        await ctx.db.patch(user._id, { activeWorkspaceId: workspaceId });

        // Schedule data backfill for this user's workspace
        await ctx.scheduler.runAfter(
          0,
          internal.migrations.backfillUserData,
          { userId: user._id, workspaceId },
        );
        migratedCount++;
      }
    }

    console.log(
      `Provisioned workspaces for ${migratedCount}/${users.length} users`,
    );
    return null;
  },
});

/**
 * Backfill workspaceId on all data owned by a single user.
 * Handles tasks, staffMembers, subtasks, taskTemplates, taskAttachments.
 */
export const backfillUserData = internalMutation({
  args: {
    userId: v.id("users"),
    workspaceId: v.id("workspaces"),
  },
  returns: v.null(),
  handler: async (ctx, { userId, workspaceId }) => {
    let writes = 0;

    // Backfill tasks
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_userId_status_sortOrder", (q) => q.eq("userId", userId))
      .take(BATCH_SIZE);

    for (const task of tasks) {
      if (!task.workspaceId) {
        await ctx.db.patch(task._id, { workspaceId });
        writes++;
      }
    }

    // Backfill staffMembers (those owned by this user)
    const staff = await ctx.db
      .query("staffMembers")
      .withIndex("by_ownerUserId", (q) => q.eq("ownerUserId", userId))
      .take(BATCH_SIZE);

    for (const member of staff) {
      if (!member.workspaceId) {
        await ctx.db.patch(member._id, { workspaceId });
        writes++;
      }
    }

    // Backfill taskTemplates
    const templates = await ctx.db
      .query("taskTemplates")
      .withIndex("by_userId_category", (q) => q.eq("userId", userId))
      .take(BATCH_SIZE);

    for (const tmpl of templates) {
      if (!tmpl.workspaceId) {
        await ctx.db.patch(tmpl._id, { workspaceId });
        writes++;
      }
    }

    // Backfill subtasks + taskAttachments via tasks (need parent task's workspaceId)
    for (const task of tasks) {
      const subtasks = await ctx.db
        .query("subtasks")
        .withIndex("by_parentTaskId_and_sortOrder", (q) =>
          q.eq("parentTaskId", task._id),
        )
        .take(BATCH_SIZE);

      for (const sub of subtasks) {
        if (!sub.workspaceId) {
          await ctx.db.patch(sub._id, { workspaceId });
          writes++;
        }
      }

      const attachments = await ctx.db
        .query("taskAttachments")
        .withIndex("by_taskId", (q) => q.eq("taskId", task._id))
        .take(BATCH_SIZE);

      for (const att of attachments) {
        if (!att.workspaceId) {
          await ctx.db.patch(att._id, { workspaceId });
          writes++;
        }
      }
    }

    console.log(
      `Backfilled ${writes} records for user ${userId}`,
    );

    // Check if there are more tasks without workspaceId — schedule continuation
    const remaining = await ctx.db
      .query("tasks")
      .withIndex("by_userId_status_sortOrder", (q) => q.eq("userId", userId))
      .take(1);

    const hasUnmigrated = remaining.some((t) => !t.workspaceId);
    if (hasUnmigrated || tasks.length === BATCH_SIZE) {
      await ctx.scheduler.runAfter(
        0,
        internal.migrations.backfillUserData,
        { userId, workspaceId },
      );
    }

    return null;
  },
});

/**
 * Verification query: check for any records missing workspaceId.
 * Run after migration to ensure completeness.
 */
export const verifyMigration = internalMutation({
  args: {},
  returns: v.object({
    tasksWithoutWorkspace: v.number(),
    staffWithoutWorkspace: v.number(),
    templatesWithoutWorkspace: v.number(),
    usersWithoutWorkspace: v.number(),
  }),
  handler: async (ctx) => {
    let tasksWithoutWorkspace = 0;
    let staffWithoutWorkspace = 0;
    let templatesWithoutWorkspace = 0;
    let usersWithoutWorkspace = 0;

    const tasks = await ctx.db.query("tasks").take(500);
    for (const t of tasks) {
      if (!t.workspaceId) tasksWithoutWorkspace++;
    }

    const staff = await ctx.db.query("staffMembers").take(500);
    for (const s of staff) {
      if (!s.workspaceId) staffWithoutWorkspace++;
    }

    const templates = await ctx.db.query("taskTemplates").take(500);
    for (const t of templates) {
      if (!t.workspaceId) templatesWithoutWorkspace++;
    }

    const users = await ctx.db.query("users").take(500);
    for (const u of users) {
      if (!u.activeWorkspaceId) usersWithoutWorkspace++;
    }

    console.log("Migration verification:", {
      tasksWithoutWorkspace,
      staffWithoutWorkspace,
      templatesWithoutWorkspace,
      usersWithoutWorkspace,
    });

    return {
      tasksWithoutWorkspace,
      staffWithoutWorkspace,
      templatesWithoutWorkspace,
      usersWithoutWorkspace,
    };
  },
});
