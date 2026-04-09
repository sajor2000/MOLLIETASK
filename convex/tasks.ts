import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  workstreamValidator,
  priorityValidator,
  statusValidator,
  recurringValidator,
} from "./schema";
import { getAuthUser, getAuthUserId } from "./authHelpers";

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
    const user = await getAuthUser(ctx);

    if (args.title.length > 200) throw new Error("Title max 200 characters");
    if (args.notes && args.notes.length > 2000)
      throw new Error("Notes max 2000 characters");
    if (args.dueTime && !/^\d{2}:\d{2}$/.test(args.dueTime))
      throw new Error("dueTime must be HH:MM");

    const existing = await ctx.db
      .query("tasks")
      .withIndex("by_userId_status_sortOrder", (q) =>
        q.eq("userId", user._id).eq("status", args.status),
      )
      .order("desc")
      .first();

    const sortOrder = existing ? existing.sortOrder + 1000 : 1000;

    const taskId = await ctx.db.insert("tasks", {
      ...args,
      userId: user._id,
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

    await ctx.db.patch(user._id, { lastUsedWorkstream: args.workstream });

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

    await ctx.db.patch(taskId, { ...updates, reminderSent: undefined });

    if (updates.reminderAt) {
      const scheduledId = await ctx.scheduler.runAt(
        updates.reminderAt,
        internal.reminders.sendReminder,
        { taskId },
      );
      await ctx.db.patch(taskId, { scheduledReminderId: scheduledId });
    }

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

    if (task.scheduledReminderId) {
      await ctx.scheduler.cancel(task.scheduledReminderId);
    }

    await ctx.db.patch(taskId, {
      status: "done",
      completedAt: Date.now(),
      scheduledReminderId: undefined,
    });

    if (task.recurring && task.dueDate) {
      const nextDueDate = computeNextDueDate(task.dueDate, task.recurring);
      const nextTaskId = await ctx.db.insert("tasks", {
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
      return nextTaskId;
    }

    return null;
  },
});

export const uncompleteTask = mutation({
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

    await ctx.db.patch(taskId, {
      status: "todo",
      completedAt: undefined,
    });

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

    await ctx.db.patch(taskId, {
      status: newStatus,
      sortOrder: newSortOrder,
    });

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
