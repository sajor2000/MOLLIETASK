import { v } from "convex/values";
import { mutation, query, MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  workstreamValidator,
  priorityValidator,
  statusValidator,
  recurringValidator,
} from "./schema";
import { getAuthUserId } from "./authHelpers";

// ── Queries ──────────────────────────────────────────

export const getTasksByStatus = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("tasks"),
    _creationTime: v.number(),
    userId: v.id("users"),
    title: v.string(),
    workstream: workstreamValidator,
    priority: priorityValidator,
    status: statusValidator,
    dueDate: v.optional(v.number()),
    dueTime: v.optional(v.string()),
    recurring: v.optional(recurringValidator),
    notes: v.optional(v.string()),
    sortOrder: v.number(),
    reminderAt: v.optional(v.number()),
    reminderSent: v.optional(v.boolean()),
    scheduledReminderId: v.optional(v.id("_scheduled_functions")),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    subtaskTotal: v.optional(v.number()),
    subtaskCompleted: v.optional(v.number()),
  })),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    return await ctx.db
      .query("tasks")
      .withIndex("by_userId_status_sortOrder", (q) => q.eq("userId", userId))
      .take(500);
  },
});

export const getTask = query({
  args: { taskId: v.id("tasks") },
  returns: v.union(
    v.object({
      _id: v.id("tasks"),
      _creationTime: v.number(),
      userId: v.id("users"),
      title: v.string(),
      workstream: workstreamValidator,
      priority: priorityValidator,
      status: statusValidator,
      dueDate: v.optional(v.number()),
      dueTime: v.optional(v.string()),
      recurring: v.optional(recurringValidator),
      notes: v.optional(v.string()),
      sortOrder: v.number(),
      reminderAt: v.optional(v.number()),
      reminderSent: v.optional(v.boolean()),
      scheduledReminderId: v.optional(v.id("_scheduled_functions")),
      completedAt: v.optional(v.number()),
      createdAt: v.number(),
      subtaskTotal: v.optional(v.number()),
      subtaskCompleted: v.optional(v.number()),
    }),
    v.null(),
  ),
  handler: async (ctx, { taskId }) => {
    const userId = await getAuthUserId(ctx);
    const task = await ctx.db.get(taskId);
    if (!task || task.userId !== userId) return null;
    return task;
  },
});

// ── Shared helpers ──────────────────────────────────

/** Complete a task: check subtasks, cancel reminder, handle recurring + clone subtasks. */
export async function completeTaskCore(
  ctx: MutationCtx,
  task: Doc<"tasks">,
  extraPatch?: { sortOrder?: number },
): Promise<{ nextTaskId: Id<"tasks"> | null; wasRecurring: boolean }> {
  const subtasks = await ctx.db
    .query("subtasks")
    .withIndex("by_parentTaskId_and_sortOrder", (q) =>
      q.eq("parentTaskId", task._id),
    )
    .take(50);
  if (subtasks.length > 0 && subtasks.some((s) => !s.isComplete)) {
    throw new Error("All subtasks must be completed first");
  }

  if (task.scheduledReminderId) {
    await ctx.scheduler.cancel(task.scheduledReminderId);
  }

  await ctx.db.patch(task._id, {
    status: "done" as const,
    completedAt: Date.now(),
    scheduledReminderId: undefined,
    ...extraPatch,
  });

  let nextTaskId: Id<"tasks"> | null = null;
  if (task.recurring && task.dueDate) {
    const nextDueDate = computeNextDueDate(task.dueDate, task.recurring);
    nextTaskId = await ctx.db.insert("tasks", {
      userId: task.userId,
      title: task.title,
      workstream: task.workstream,
      priority: task.priority,
      status: "todo",
      dueDate: nextDueDate,
      dueTime: task.dueTime,
      recurring: task.recurring,
      notes: task.notes,
      sortOrder: task.sortOrder,
      createdAt: Date.now(),
    });

    if (subtasks.length > 0) {
      for (const subtask of subtasks) {
        await ctx.db.insert("subtasks", {
          parentTaskId: nextTaskId,
          userId: task.userId,
          title: subtask.title,
          isComplete: false,
          sortOrder: subtask.sortOrder,
          createdAt: Date.now(),
        });
      }
      await ctx.db.patch(nextTaskId, {
        subtaskTotal: subtasks.length,
        subtaskCompleted: 0,
      });
    }
  }

  return { nextTaskId, wasRecurring: !!(task.recurring && task.dueDate) };
}

/** Delete all attachments (records + storage blobs) for a task. */
export async function deleteTaskAttachments(
  ctx: MutationCtx,
  taskId: Id<"tasks">,
) {
  const attachments = await ctx.db
    .query("taskAttachments")
    .withIndex("by_taskId", (q) => q.eq("taskId", taskId))
    .take(50);
  for (const att of attachments) {
    await ctx.storage.delete(att.storageId);
    await ctx.db.delete(att._id);
  }
}

// ── Mutations ────────────────────────────────────────

export const addTask = mutation({
  args: {
    title: v.string(),
    workstream: workstreamValidator,
    priority: priorityValidator,
    status: statusValidator,
    dueDate: v.optional(v.number()),
    dueTime: v.optional(v.string()),
    recurring: v.optional(recurringValidator),
    notes: v.optional(v.string()),
    reminderAt: v.optional(v.number()),
  },
  returns: v.id("tasks"),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (args.title.length > 200) throw new Error("Title max 200 characters");
    if (args.notes && args.notes.length > 2000)
      throw new Error("Notes max 2000 characters");
    if (args.dueTime && !/^\d{2}:\d{2}$/.test(args.dueTime))
      throw new Error("dueTime must be HH:MM");

    const existing = await ctx.db
      .query("tasks")
      .withIndex("by_userId_status_sortOrder", (q) =>
        q.eq("userId", userId).eq("status", args.status),
      )
      .order("desc")
      .first();

    const sortOrder = existing ? existing.sortOrder + 1000 : 1000;

    const taskId = await ctx.db.insert("tasks", {
      ...args,
      userId,
      sortOrder,
      createdAt: Date.now(),
    });

    if (args.reminderAt) {
      const scheduledId = await ctx.scheduler.runAt(
        args.reminderAt,
        internal.reminders.sendReminder,
        { taskId },
      );
      await ctx.db.patch(taskId, { scheduledReminderId: scheduledId });
    }

    await ctx.db.patch(userId, { lastUsedWorkstream: args.workstream });

    return taskId;
  },
});

export const updateTask = mutation({
  args: {
    taskId: v.id("tasks"),
    title: v.optional(v.string()),
    workstream: v.optional(workstreamValidator),
    priority: v.optional(priorityValidator),
    status: v.optional(statusValidator),
    dueDate: v.optional(v.number()),
    dueTime: v.optional(v.string()),
    recurring: v.optional(recurringValidator),
    notes: v.optional(v.string()),
    reminderAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, { taskId, ...updates }) => {
    const userId = await getAuthUserId(ctx);

    const task = await ctx.db.get(taskId);
    if (!task || task.userId !== userId) {
      throw new Error("Task not found");
    }

    if (updates.title !== undefined && updates.title.length > 200)
      throw new Error("Title max 200 characters");
    if (updates.notes !== undefined && updates.notes.length > 2000)
      throw new Error("Notes max 2000 characters");
    if (updates.dueTime !== undefined && !/^\d{2}:\d{2}$/.test(updates.dueTime))
      throw new Error("dueTime must be HH:MM");

    if (updates.reminderAt !== undefined && task.scheduledReminderId) {
      await ctx.scheduler.cancel(task.scheduledReminderId);
    }

    const patch: Record<string, unknown> = { ...updates };
    if (updates.reminderAt !== undefined) {
      patch.reminderSent = undefined;
    }
    if (updates.reminderAt) {
      const scheduledId = await ctx.scheduler.runAt(
        updates.reminderAt,
        internal.reminders.sendReminder,
        { taskId },
      );
      patch.scheduledReminderId = scheduledId;
    }
    await ctx.db.patch(taskId, patch);

    if (updates.workstream) {
      await ctx.db.patch(userId, { lastUsedWorkstream: updates.workstream });
    }

    return null;
  },
});

export const deleteTask = mutation({
  args: {
    taskId: v.id("tasks"),
  },
  returns: v.null(),
  handler: async (ctx, { taskId }) => {
    const userId = await getAuthUserId(ctx);

    const task = await ctx.db.get(taskId);
    if (!task || task.userId !== userId) {
      throw new Error("Task not found");
    }

    if (task.scheduledReminderId) {
      await ctx.scheduler.cancel(task.scheduledReminderId);
    }

    // Cascade-delete subtasks
    const subtasks = await ctx.db
      .query("subtasks")
      .withIndex("by_parentTaskId_and_sortOrder", (q) =>
        q.eq("parentTaskId", taskId),
      )
      .take(50);
    for (const subtask of subtasks) {
      await ctx.db.delete(subtask._id);
    }

    await deleteTaskAttachments(ctx, taskId);
    await ctx.db.delete(taskId);
    return null;
  },
});

export const completeTask = mutation({
  args: {
    taskId: v.id("tasks"),
  },
  returns: v.union(v.id("tasks"), v.null()),
  handler: async (ctx, { taskId }) => {
    const userId = await getAuthUserId(ctx);

    const task = await ctx.db.get(taskId);
    if (!task || task.userId !== userId) {
      throw new Error("Task not found");
    }

    const result = await completeTaskCore(ctx, task);
    return result.nextTaskId;
  },
});

export const uncompleteTask = mutation({
  args: {
    taskId: v.id("tasks"),
    previousStatus: v.optional(statusValidator),
    spawnedTaskId: v.optional(v.id("tasks")),
  },
  returns: v.null(),
  handler: async (ctx, { taskId, previousStatus, spawnedTaskId }) => {
    const userId = await getAuthUserId(ctx);

    const task = await ctx.db.get(taskId);
    if (!task || task.userId !== userId) {
      throw new Error("Task not found");
    }

    await ctx.db.patch(taskId, {
      status: previousStatus ?? "todo",
      completedAt: undefined,
    });

    // Clean up spawned recurring copy on undo
    if (spawnedTaskId) {
      const spawned = await ctx.db.get(spawnedTaskId);
      if (spawned && spawned.userId === userId) {
        const subtasks = await ctx.db
          .query("subtasks")
          .withIndex("by_parentTaskId_and_sortOrder", (q) =>
            q.eq("parentTaskId", spawnedTaskId),
          )
          .take(50);
        for (const s of subtasks) {
          await ctx.db.delete(s._id);
        }
        await ctx.db.delete(spawnedTaskId);
      }
    }

    return null;
  },
});

export const reorderTask = mutation({
  args: {
    taskId: v.id("tasks"),
    newStatus: statusValidator,
    newSortOrder: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { taskId, newStatus, newSortOrder }) => {
    const userId = await getAuthUserId(ctx);

    const task = await ctx.db.get(taskId);
    if (!task || task.userId !== userId) {
      throw new Error("Task not found");
    }

    // Full completion flow when dragging to done (subtask guard, reminder cancel, recurring)
    if (newStatus === "done" && task.status !== "done") {
      await completeTaskCore(ctx, task, { sortOrder: newSortOrder });
    } else {
      await ctx.db.patch(taskId, {
        status: newStatus,
        sortOrder: newSortOrder,
      });
    }

    return null;
  },
});

export const deleteCompletedTasks = mutation({
  args: {},
  returns: v.object({ deleted: v.number(), hasMore: v.boolean() }),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);

    const completed = await ctx.db
      .query("tasks")
      .withIndex("by_userId_status_sortOrder", (q) =>
        q.eq("userId", userId).eq("status", "done"),
      )
      .take(101);

    const batch = completed.slice(0, 100);
    for (const task of batch) {
      // Cascade-delete subtasks
      const subtasks = await ctx.db
        .query("subtasks")
        .withIndex("by_parentTaskId_and_sortOrder", (q) =>
          q.eq("parentTaskId", task._id),
        )
        .take(50);
      for (const subtask of subtasks) {
        await ctx.db.delete(subtask._id);
      }
      await deleteTaskAttachments(ctx, task._id);
      await ctx.db.delete(task._id);
    }

    return { deleted: batch.length, hasMore: completed.length > 100 };
  },
});

// ── Helpers ──────────────────────────────────────────
// Shared with telegramBot.ts — single source of truth for recurrence logic

export function computeNextDueDate(
  currentDueDate: number,
  recurring: "daily" | "weekdays" | "weekly" | "monthly",
): number {
  const now = Date.now();
  const date = new Date(currentDueDate);

  switch (recurring) {
    case "daily": {
      const diffDays = Math.ceil(
        (now - date.getTime()) / (24 * 60 * 60 * 1000),
      );
      date.setDate(date.getDate() + Math.max(diffDays, 1));
      if (date.getTime() <= now) date.setDate(date.getDate() + 1);
      return date.getTime();
    }
    case "weekdays": {
      do {
        date.setDate(date.getDate() + 1);
        while (date.getDay() === 0 || date.getDay() === 6) {
          date.setDate(date.getDate() + 1);
        }
      } while (date.getTime() <= now);
      return date.getTime();
    }
    case "weekly": {
      const diffWeeks = Math.ceil(
        (now - date.getTime()) / (7 * 24 * 60 * 60 * 1000),
      );
      date.setDate(date.getDate() + Math.max(diffWeeks, 1) * 7);
      if (date.getTime() <= now) date.setDate(date.getDate() + 7);
      return date.getTime();
    }
    case "monthly": {
      const dayOfMonth = date.getDate();
      do {
        date.setMonth(date.getMonth() + 1);
        const maxDay = new Date(
          date.getFullYear(),
          date.getMonth() + 1,
          0,
        ).getDate();
        date.setDate(Math.min(dayOfMonth, maxDay));
      } while (date.getTime() <= now);
      return date.getTime();
    }
    default:
      return currentDueDate;
  }
}
