import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  workstreamValidator,
  priorityValidator,
  statusValidator,
  recurringValidator,
} from "./schema";
import { computeNextDueDate } from "./tasks";

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

    // Filter out undefined values before patching
    const patch: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(updates)) {
      if (val !== undefined) patch[k] = val;
    }

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

    if (task.scheduledReminderId) {
      await ctx.scheduler.cancel(task.scheduledReminderId);
    }

    await ctx.db.patch(taskId, {
      status: "done",
      completedAt: Date.now(),
      scheduledReminderId: undefined,
    });

    let wasRecurring = false;
    if (task.recurring && task.dueDate) {
      wasRecurring = true;
      const nextDueDate = computeNextDueDate(task.dueDate, task.recurring);
      await ctx.db.insert("tasks", {
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
    }

    return {
      success: true as const,
      title: task.title,
      workstream: task.workstream,
      wasRecurring,
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

export const updateSettingsFromTelegram = internalMutation({
  args: {
    userId: v.id("users"),
    timezone: v.optional(v.string()),
    digestTime: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { userId, timezone, digestTime }) => {
    if (timezone !== undefined) {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: timezone });
      } catch {
        throw new Error("Invalid timezone");
      }
    }
    if (digestTime !== undefined && digestTime !== "") {
      if (!/^\d{2}:\d{2}$/.test(digestTime)) throw new Error("digestTime must be HH:MM");
      const [h, m] = digestTime.split(":").map(Number);
      if (h < 0 || h > 23 || m < 0 || m > 59) throw new Error("digestTime out of range");
    }

    const patch: Record<string, unknown> = {};
    if (timezone !== undefined) patch.timezone = timezone;
    if (digestTime !== undefined) patch.digestTime = digestTime || undefined;

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(userId, patch);
    }
    return null;
  },
});

