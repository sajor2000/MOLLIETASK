import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  workstreamValidator,
  priorityValidator,
  statusValidator,
  recurringValidator,
} from "./schema";
import { completeTaskCore, deleteTaskAttachments } from "./tasks";
import { updateParentCounts } from "./subtasks";
import { validateTimezone, validateDigestTime } from "./validation";

// ── Queries ─────────────────────────────────────────

export const getUserByChatId = internalQuery({
  args: { chatId: v.string() },
  returns: v.union(
    v.object({
      _id: v.id("users"),
      telegramChatId: v.optional(v.string()),
      timezone: v.optional(v.string()),
      digestTime: v.optional(v.string()),
      lastUsedWorkstream: v.optional(workstreamValidator),
    }),
    v.null(),
  ),
  handler: async (ctx, { chatId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_telegramChatId", (q) => q.eq("telegramChatId", chatId))
      .first();
    if (!user) return null;
    return {
      _id: user._id,
      telegramChatId: user.telegramChatId,
      timezone: user.timezone,
      digestTime: user.digestTime,
      lastUsedWorkstream: user.lastUsedWorkstream,
    };
  },
});

export const getTasksForTelegram = internalQuery({
  args: {
    userId: v.id("users"),
    statusFilter: v.optional(statusValidator),
  },
  returns: v.array(
    v.object({
      _id: v.id("tasks"),
      title: v.string(),
      workstream: workstreamValidator,
      priority: priorityValidator,
      status: statusValidator,
      dueDate: v.optional(v.number()),
      dueTime: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, { userId, statusFilter }) => {
    const status = statusFilter ?? "todo";
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_userId_status_sortOrder", (q) =>
        q.eq("userId", userId).eq("status", status),
      )
      .take(50);

    return tasks.map((t) => ({
      _id: t._id,
      title: t.title,
      workstream: t.workstream,
      priority: t.priority,
      status: t.status,
      dueDate: t.dueDate,
      dueTime: t.dueTime,
    }));
  },
});

// ── Mutations ───────────────────────────────────────

export const addTaskFromTelegram = internalMutation({
  args: {
    userId: v.id("users"),
    title: v.string(),
    workstream: workstreamValidator,
    priority: priorityValidator,
    dueDate: v.optional(v.number()),
    dueTime: v.optional(v.string()),
    notes: v.optional(v.string()),
    recurring: v.optional(recurringValidator),
  },
  returns: v.id("tasks"),
  handler: async (ctx, { userId, title, workstream, priority, ...optional }) => {
    if (title.length > 200) throw new Error("Title max 200 characters");
    if (optional.dueTime && !/^\d{2}:\d{2}$/.test(optional.dueTime))
      throw new Error("dueTime must be HH:MM");

    const existing = await ctx.db
      .query("tasks")
      .withIndex("by_userId_status_sortOrder", (q) =>
        q.eq("userId", userId).eq("status", "todo"),
      )
      .order("desc")
      .first();

    const sortOrder = existing ? existing.sortOrder + 1000 : 1000;

    const taskId = await ctx.db.insert("tasks", {
      userId,
      title,
      workstream,
      priority,
      status: "todo",
      sortOrder,
      createdAt: Date.now(),
      ...optional,
    });

    await ctx.db.patch(userId, { lastUsedWorkstream: workstream });
    return taskId;
  },
});

export const editTaskFromTelegram = internalMutation({
  args: {
    userId: v.id("users"),
    taskId: v.id("tasks"),
    title: v.optional(v.string()),
    workstream: v.optional(workstreamValidator),
    priority: v.optional(priorityValidator),
    dueDate: v.optional(v.number()),
    dueTime: v.optional(v.string()),
    notes: v.optional(v.string()),
    recurring: v.optional(recurringValidator),
  },
  returns: v.union(
    v.object({ success: v.literal(false) }),
    v.object({
      success: v.literal(true),
      title: v.string(),
      changes: v.array(v.string()),
    }),
  ),
  handler: async (ctx, { userId, taskId, ...updates }) => {
    const task = await ctx.db.get(taskId);
    if (!task || task.userId !== userId) {
      return { success: false as const };
    }

    if (updates.title !== undefined && updates.title.length > 200)
      throw new Error("Title max 200 characters");
    if (updates.dueTime !== undefined && !/^\d{2}:\d{2}$/.test(updates.dueTime))
      throw new Error("dueTime must be HH:MM");

    const changes: string[] = [];
    if (updates.title !== undefined) changes.push(`title → "${updates.title}"`);
    if (updates.workstream !== undefined) changes.push(`workstream → ${updates.workstream}`);
    if (updates.priority !== undefined) changes.push(`priority → ${updates.priority}`);
    if (updates.dueDate !== undefined) {
      const d = new Date(updates.dueDate);
      changes.push(`due → ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`);
    }
    if (updates.dueTime !== undefined) changes.push(`time → ${updates.dueTime}`);
    if (updates.notes !== undefined) changes.push("notes updated");
    if (updates.recurring !== undefined) changes.push(`recurring → ${updates.recurring}`);

    // Build typed patch from defined fields
    const patch = {
      ...(updates.title !== undefined && { title: updates.title }),
      ...(updates.workstream !== undefined && { workstream: updates.workstream }),
      ...(updates.priority !== undefined && { priority: updates.priority }),
      ...(updates.dueDate !== undefined && { dueDate: updates.dueDate }),
      ...(updates.dueTime !== undefined && { dueTime: updates.dueTime }),
      ...(updates.notes !== undefined && { notes: updates.notes }),
      ...(updates.recurring !== undefined && { recurring: updates.recurring }),
    };

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(taskId, patch);
    }

    if (updates.workstream) {
      await ctx.db.patch(userId, { lastUsedWorkstream: updates.workstream });
    }

    return {
      success: true as const,
      title: updates.title ?? task.title,
      changes,
    };
  },
});

export const completeTaskFromTelegram = internalMutation({
  args: {
    userId: v.id("users"),
    taskId: v.id("tasks"),
  },
  returns: v.union(
    v.object({
      success: v.literal(false),
    }),
    v.object({
      success: v.literal(true),
      title: v.string(),
      workstream: workstreamValidator,
      wasRecurring: v.boolean(),
    }),
  ),
  handler: async (ctx, { userId, taskId }) => {
    const task = await ctx.db.get(taskId);
    if (!task || task.userId !== userId) {
      return { success: false as const };
    }

    const result = await completeTaskCore(ctx, task);

    return {
      success: true as const,
      title: task.title,
      workstream: task.workstream,
      wasRecurring: result.wasRecurring,
    };
  },
});

export const snoozeTask = internalMutation({
  args: {
    userId: v.id("users"),
    taskId: v.id("tasks"),
    durationMs: v.number(),
  },
  returns: v.union(
    v.object({
      success: v.literal(false),
    }),
    v.object({
      success: v.literal(true),
      title: v.string(),
      newReminderAt: v.number(),
    }),
  ),
  handler: async (ctx, { userId, taskId, durationMs }) => {
    const task = await ctx.db.get(taskId);
    if (!task || task.userId !== userId) {
      return { success: false as const };
    }

    if (task.scheduledReminderId) {
      await ctx.scheduler.cancel(task.scheduledReminderId);
    }

    const newReminderAt = Date.now() + durationMs;

    const scheduledId = await ctx.scheduler.runAt(
      newReminderAt,
      internal.reminders.sendReminder,
      { taskId },
    );

    await ctx.db.patch(taskId, {
      reminderAt: newReminderAt,
      reminderSent: false,
      scheduledReminderId: scheduledId,
    });

    return { success: true as const, title: task.title, newReminderAt };
  },
});

export const deleteTaskFromTelegram = internalMutation({
  args: {
    userId: v.id("users"),
    taskId: v.id("tasks"),
  },
  returns: v.union(
    v.object({ success: v.literal(false) }),
    v.object({
      success: v.literal(true),
      title: v.string(),
      workstream: workstreamValidator,
    }),
  ),
  handler: async (ctx, { userId, taskId }) => {
    const task = await ctx.db.get(taskId);
    if (!task || task.userId !== userId) {
      return { success: false as const };
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
    for (const sub of subtasks) {
      await ctx.db.delete(sub._id);
    }

    await deleteTaskAttachments(ctx, taskId);
    const { title, workstream } = task;
    await ctx.db.delete(taskId);

    return { success: true as const, title, workstream };
  },
});

// ── Subtask operations ─────────────────────────────

export const getSubtasksForTelegram = internalQuery({
  args: {
    userId: v.id("users"),
    taskId: v.id("tasks"),
  },
  returns: v.array(
    v.object({
      _id: v.id("subtasks"),
      title: v.string(),
      isComplete: v.boolean(),
      sortOrder: v.number(),
    }),
  ),
  handler: async (ctx, { userId, taskId }) => {
    const task = await ctx.db.get(taskId);
    if (!task || task.userId !== userId) return [];
    const subtasks = await ctx.db
      .query("subtasks")
      .withIndex("by_parentTaskId_and_sortOrder", (q) =>
        q.eq("parentTaskId", taskId),
      )
      .take(50);
    return subtasks.map((s) => ({
      _id: s._id,
      title: s.title,
      isComplete: s.isComplete,
      sortOrder: s.sortOrder,
    }));
  },
});

export const addSubtaskFromTelegram = internalMutation({
  args: {
    userId: v.id("users"),
    taskId: v.id("tasks"),
    title: v.string(),
  },
  returns: v.union(
    v.object({ success: v.literal(false) }),
    v.object({ success: v.literal(true), title: v.string() }),
  ),
  handler: async (ctx, { userId, taskId, title }) => {
    const task = await ctx.db.get(taskId);
    if (!task || task.userId !== userId) return { success: false as const };

    if (title.length > 200) throw new Error("Subtask title max 200 characters");

    const existing = await ctx.db
      .query("subtasks")
      .withIndex("by_parentTaskId_and_sortOrder", (q) =>
        q.eq("parentTaskId", taskId),
      )
      .take(21);

    if (existing.length >= 20) throw new Error("Maximum 20 subtasks per task");

    const last = existing[existing.length - 1];
    const sortOrder = last ? last.sortOrder + 1000 : 1000;

    await ctx.db.insert("subtasks", {
      parentTaskId: taskId,
      userId,
      title: title.trim(),
      isComplete: false,
      sortOrder,
      createdAt: Date.now(),
    });

    await updateParentCounts(ctx, taskId);
    return { success: true as const, title: title.trim() };
  },
});

export const toggleSubtaskFromTelegram = internalMutation({
  args: {
    userId: v.id("users"),
    subtaskId: v.id("subtasks"),
  },
  returns: v.union(
    v.object({ success: v.literal(false) }),
    v.object({ success: v.literal(true), title: v.string(), isComplete: v.boolean() }),
  ),
  handler: async (ctx, { userId, subtaskId }) => {
    const subtask = await ctx.db.get(subtaskId);
    if (!subtask || subtask.userId !== userId) return { success: false as const };

    const newState = !subtask.isComplete;
    await ctx.db.patch(subtaskId, { isComplete: newState });
    await updateParentCounts(ctx, subtask.parentTaskId);

    return { success: true as const, title: subtask.title, isComplete: newState };
  },
});

// ── Settings ──────────────────────────────────────

export const updateSettingsFromTelegram = internalMutation({
  args: {
    userId: v.id("users"),
    timezone: v.optional(v.string()),
    digestTime: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { userId, timezone, digestTime }) => {
    if (timezone !== undefined) validateTimezone(timezone);
    if (digestTime !== undefined && digestTime !== "") validateDigestTime(digestTime);

    const patch = {
      ...(timezone !== undefined && { timezone }),
      ...(digestTime !== undefined && { digestTime: digestTime || undefined }),
    };

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(userId, patch);
    }
    return null;
  },
});

