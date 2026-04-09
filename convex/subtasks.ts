import { v } from "convex/values";
import { mutation, query, internalMutation, MutationCtx } from "./_generated/server";
import { getAuthUserId } from "./authHelpers";
import type { Id } from "./_generated/dataModel";

const MAX_SUBTASKS_PER_TASK = 20;

/** Recalculate and patch denormalized subtask counts on the parent task */
async function updateParentCounts(ctx: MutationCtx, parentTaskId: Id<"tasks">) {
  const subtasks = await ctx.db
    .query("subtasks")
    .withIndex("by_parentTaskId_and_sortOrder", (q) =>
      q.eq("parentTaskId", parentTaskId),
    )
    .take(50);
  await ctx.db.patch(parentTaskId, {
    subtaskTotal: subtasks.length,
    subtaskCompleted: subtasks.filter((s) => s.isComplete).length,
  });
}

// ── Queries ──────────────────────────────────────────

export const getSubtasks = query({
  args: { parentTaskId: v.id("tasks") },
  returns: v.array(
    v.object({
      _id: v.id("subtasks"),
      _creationTime: v.number(),
      parentTaskId: v.id("tasks"),
      userId: v.id("users"),
      title: v.string(),
      isComplete: v.boolean(),
      sortOrder: v.number(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, { parentTaskId }) => {
    const userId = await getAuthUserId(ctx);
    const task = await ctx.db.get(parentTaskId);
    if (!task || task.userId !== userId) return [];
    return await ctx.db
      .query("subtasks")
      .withIndex("by_parentTaskId_and_sortOrder", (q) =>
        q.eq("parentTaskId", parentTaskId),
      )
      .take(50);
  },
});

export const getSubtaskCounts = query({
  args: { parentTaskId: v.id("tasks") },
  returns: v.object({ total: v.number(), completed: v.number() }),
  handler: async (ctx, { parentTaskId }) => {
    const userId = await getAuthUserId(ctx);
    const task = await ctx.db.get(parentTaskId);
    if (!task || task.userId !== userId) return { total: 0, completed: 0 };
    const subtasks = await ctx.db
      .query("subtasks")
      .withIndex("by_parentTaskId_and_sortOrder", (q) =>
        q.eq("parentTaskId", parentTaskId),
      )
      .take(50);
    return {
      total: subtasks.length,
      completed: subtasks.filter((s) => s.isComplete).length,
    };
  },
});

// ── Mutations ────────────────────────────────────────

export const addSubtask = mutation({
  args: {
    parentTaskId: v.id("tasks"),
    title: v.string(),
  },
  returns: v.id("subtasks"),
  handler: async (ctx, { parentTaskId, title }) => {
    const userId = await getAuthUserId(ctx);
    const task = await ctx.db.get(parentTaskId);
    if (!task || task.userId !== userId) throw new Error("Task not found");

    if (title.length > 200) throw new Error("Subtask title max 200 characters");

    const existing = await ctx.db
      .query("subtasks")
      .withIndex("by_parentTaskId_and_sortOrder", (q) =>
        q.eq("parentTaskId", parentTaskId),
      )
      .take(MAX_SUBTASKS_PER_TASK + 1);

    if (existing.length >= MAX_SUBTASKS_PER_TASK) {
      throw new Error(`Maximum ${MAX_SUBTASKS_PER_TASK} subtasks per task`);
    }

    const last = existing[existing.length - 1];
    const sortOrder = last ? last.sortOrder + 1000 : 1000;

    const id = await ctx.db.insert("subtasks", {
      parentTaskId,
      userId,
      title: title.trim(),
      isComplete: false,
      sortOrder,
      createdAt: Date.now(),
    });
    await updateParentCounts(ctx, parentTaskId);
    return id;
  },
});

export const toggleSubtask = mutation({
  args: { subtaskId: v.id("subtasks") },
  returns: v.null(),
  handler: async (ctx, { subtaskId }) => {
    const userId = await getAuthUserId(ctx);
    const subtask = await ctx.db.get(subtaskId);
    if (!subtask || subtask.userId !== userId) throw new Error("Subtask not found");

    await ctx.db.patch(subtaskId, { isComplete: !subtask.isComplete });
    await updateParentCounts(ctx, subtask.parentTaskId);
    return null;
  },
});

export const deleteSubtask = mutation({
  args: { subtaskId: v.id("subtasks") },
  returns: v.null(),
  handler: async (ctx, { subtaskId }) => {
    const userId = await getAuthUserId(ctx);
    const subtask = await ctx.db.get(subtaskId);
    if (!subtask || subtask.userId !== userId) throw new Error("Subtask not found");

    await ctx.db.delete(subtaskId);
    await updateParentCounts(ctx, subtask.parentTaskId);
    return null;
  },
});

export const reorderSubtask = mutation({
  args: {
    subtaskId: v.id("subtasks"),
    newSortOrder: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { subtaskId, newSortOrder }) => {
    const userId = await getAuthUserId(ctx);
    const subtask = await ctx.db.get(subtaskId);
    if (!subtask || subtask.userId !== userId) throw new Error("Subtask not found");

    await ctx.db.patch(subtaskId, { sortOrder: newSortOrder });
    return null;
  },
});

export const addSubtasksBatch = internalMutation({
  args: {
    parentTaskId: v.id("tasks"),
    titles: v.array(v.string()),
  },
  returns: v.array(v.id("subtasks")),
  handler: async (ctx, { parentTaskId, titles }) => {
    const task = await ctx.db.get(parentTaskId);
    if (!task) throw new Error("Task not found");

    const existing = await ctx.db
      .query("subtasks")
      .withIndex("by_parentTaskId_and_sortOrder", (q) =>
        q.eq("parentTaskId", parentTaskId),
      )
      .take(MAX_SUBTASKS_PER_TASK + 1);

    const remaining = MAX_SUBTASKS_PER_TASK - existing.length;
    const toInsert = titles.slice(0, remaining);
    const last = existing[existing.length - 1];
    let nextOrder = last ? last.sortOrder + 1000 : 1000;

    const ids: Id<"subtasks">[] = [];
    for (const title of toInsert) {
      const id = await ctx.db.insert("subtasks", {
        parentTaskId,
        userId: task.userId,
        title: title.trim().slice(0, 200),
        isComplete: false,
        sortOrder: nextOrder,
        createdAt: Date.now(),
      });
      ids.push(id);
      nextOrder += 1000;
    }
    await updateParentCounts(ctx, parentTaskId);
    return ids;
  },
});

// ── Internal mutations (called by tasks.ts) ──────────

export const deleteByParent = internalMutation({
  args: { parentTaskId: v.id("tasks") },
  handler: async (ctx, { parentTaskId }) => {
    const subtasks = await ctx.db
      .query("subtasks")
      .withIndex("by_parentTaskId_and_sortOrder", (q) =>
        q.eq("parentTaskId", parentTaskId),
      )
      .take(50);

    for (const subtask of subtasks) {
      await ctx.db.delete(subtask._id);
    }
    await ctx.db.patch(parentTaskId, { subtaskTotal: 0, subtaskCompleted: 0 });
  },
});

export const cloneForNewParent = internalMutation({
  args: {
    sourceTaskId: v.id("tasks"),
    newTaskId: v.id("tasks"),
    newUserId: v.id("users"),
  },
  handler: async (ctx, { sourceTaskId, newTaskId, newUserId }) => {
    const subtasks = await ctx.db
      .query("subtasks")
      .withIndex("by_parentTaskId_and_sortOrder", (q) =>
        q.eq("parentTaskId", sourceTaskId),
      )
      .take(50);

    for (const subtask of subtasks) {
      await ctx.db.insert("subtasks", {
        parentTaskId: newTaskId,
        userId: newUserId,
        title: subtask.title,
        isComplete: false,
        sortOrder: subtask.sortOrder,
        createdAt: Date.now(),
      });
    }
    await ctx.db.patch(newTaskId, {
      subtaskTotal: subtasks.length,
      subtaskCompleted: 0,
    });
  },
});

// ── Backfill (run once via dashboard) ──────────────────

export const backfillSubtaskCounts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const tasks = await ctx.db.query("tasks").take(500);
    for (const task of tasks) {
      if (task.subtaskTotal !== undefined) continue;
      const subtasks = await ctx.db
        .query("subtasks")
        .withIndex("by_parentTaskId_and_sortOrder", (q) =>
          q.eq("parentTaskId", task._id),
        )
        .take(50);
      await ctx.db.patch(task._id, {
        subtaskTotal: subtasks.length,
        subtaskCompleted: subtasks.filter((s) => s.isComplete).length,
      });
    }
  },
});
