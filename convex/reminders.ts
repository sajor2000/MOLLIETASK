import { v, Infer } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { workstreamValidator, statusValidator } from "./schema";

type Workstream = Infer<typeof workstreamValidator>;

// ── Consolidated read query for sendReminder ─────────

export const getReminderContext = internalQuery({
  args: { taskId: v.id("tasks") },
  returns: v.union(
    v.object({
      task: v.object({
        _id: v.id("tasks"),
        userId: v.id("users"),
        title: v.string(),
        workstream: workstreamValidator,
        status: statusValidator,
        dueTime: v.optional(v.string()),
        reminderSent: v.optional(v.boolean()),
      }),
      user: v.object({
        _id: v.id("users"),
        telegramChatId: v.optional(v.string()),
        timezone: v.optional(v.string()),
      }),
      subscriptions: v.array(v.object({
        endpoint: v.string(),
        keys: v.object({ p256dh: v.string(), auth: v.string() }),
      })),
    }),
    v.null(),
  ),
  handler: async (ctx, { taskId }) => {
    const task = await ctx.db.get(taskId);
    if (!task) return null;

    const user = await ctx.db.get(task.userId);
    if (!user) return null;

    const subs = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_userId", (q) => q.eq("userId", task.userId))
      .take(20);

    return {
      task: {
        _id: task._id,
        userId: task.userId,
        title: task.title,
        workstream: task.workstream,
        status: task.status,
        dueTime: task.dueTime,
        reminderSent: task.reminderSent,
      },
      user: {
        _id: user._id,
        telegramChatId: user.telegramChatId,
        timezone: user.timezone,
      },
      subscriptions: subs.map((s) => ({
        endpoint: s.endpoint,
        keys: s.keys,
      })),
    };
  },
});

// ── All users query (used by crons) ────────────────

export const getAllUsers = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("users"),
      telegramChatId: v.optional(v.string()),
      timezone: v.optional(v.string()),
      digestTime: v.optional(v.string()),
      lastDigestSentAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx) => {
    const users = await ctx.db.query("users").take(500);
    return users.map((u) => ({
      _id: u._id,
      telegramChatId: u.telegramChatId,
      timezone: u.timezone,
      digestTime: u.digestTime,
      lastDigestSentAt: u.lastDigestSentAt,
    }));
  },
});

// ── Overdue tasks query ──────────────────────────────

export const getOverdueTasks = internalQuery({
  args: { userId: v.id("users"), now: v.number() },
  returns: v.array(v.object({
    _id: v.id("tasks"),
    title: v.string(),
    workstream: workstreamValidator,
  })),
  handler: async (ctx, { userId, now }) => {
    // Use status+dueDate index for efficient range scan
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_userId_status_dueDate", (q) =>
        q.eq("userId", userId).eq("status", "todo").lt("dueDate", now),
      )
      .take(50);

    return tasks
      .filter((t) => !t.reminderSent)
      .map((t) => ({
        _id: t._id,
        title: t.title,
        workstream: t.workstream,
      }));
  },
});

// ── Digest counts query ──────────────────────────────

export const getDigestCounts = internalQuery({
  args: { userId: v.id("users"), todayStart: v.number(), todayEnd: v.number() },
  returns: v.array(v.object({
    workstream: workstreamValidator,
    total: v.number(),
    high: v.number(),
  })),
  handler: async (ctx, { userId, todayStart, todayEnd }) => {
    // Efficient range scan: only today's todo tasks
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_userId_status_dueDate", (q) =>
        q
          .eq("userId", userId)
          .eq("status", "todo")
          .gte("dueDate", todayStart)
          .lte("dueDate", todayEnd),
      )
      .take(500);

    // Dynamic grouping — works for any workstream value
    const groups = new Map<Workstream, { total: number; high: number }>();
    for (const t of tasks) {
      const g = groups.get(t.workstream) ?? { total: 0, high: 0 };
      g.total++;
      if (t.priority === "high") g.high++;
      groups.set(t.workstream, g);
    }

    return Array.from(groups.entries()).map(([workstream, counts]) => ({
      workstream,
      ...counts,
    }));
  },
});

// ── Actions ──────────────────────────────────────────

export const sendReminder = internalAction({
  args: { taskId: v.id("tasks") },
  returns: v.null(),
  handler: async (ctx, { taskId }) => {
    // Single consolidated read
    const data = await ctx.runQuery(internal.reminders.getReminderContext, { taskId });
    if (!data || data.task.reminderSent || data.task.status === "done") return null;

    // Parallel notification sends
    const telegramPromise = data.user.telegramChatId
      ? ctx.runAction(internal.telegram.sendReminderMessage, {
          chatId: data.user.telegramChatId,
          taskId,
          title: data.task.title,
          workstream: data.task.workstream,
          dueTime: data.task.dueTime ?? null,
        })
      : Promise.resolve(null);

    const pushPromise = data.subscriptions.length > 0
      ? ctx.runAction(internal.pushActions.sendPush, {
          subscriptions: data.subscriptions,
          title: data.task.title,
          body: `${data.task.workstream}${data.task.dueTime ? ` \u00b7 Due ${data.task.dueTime}` : ""}`,
        })
      : Promise.resolve([]);

    const [, expiredEndpoints] = await Promise.all([telegramPromise, pushPromise]);

    // Clean up expired push subscriptions (410 Gone)
    if (Array.isArray(expiredEndpoints) && expiredEndpoints.length > 0) {
      await ctx.runMutation(
        internal.pushNotifications.removeExpiredSubscriptions,
        { userId: data.task.userId, endpoints: expiredEndpoints },
      );
    }

    await ctx.runMutation(internal.reminders.markReminderSent, { taskId });
    return null;
  },
});

/** Fan out: schedule one per-user action instead of sequential loop. */
export const checkOverdue = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const users = await ctx.runQuery(internal.reminders.getAllUsers);
    for (const user of users) {
      if (user.telegramChatId) {
        await ctx.scheduler.runAfter(0, internal.reminders.checkOverdueForUser, {
          userId: user._id,
          chatId: user.telegramChatId,
        });
      }
    }
    return null;
  },
});

export const checkOverdueForUser = internalAction({
  args: { userId: v.id("users"), chatId: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, chatId }) => {
    const overdue = await ctx.runQuery(internal.reminders.getOverdueTasks, {
      userId,
      now: Date.now(),
    });
    if (overdue.length === 0) return null;

    const message = `You have ${overdue.length} overdue task${overdue.length > 1 ? "s" : ""}`;
    await ctx.runAction(internal.telegram.sendTextMessage, {
      chatId,
      text: message,
    });
    return null;
  },
});

/** Fan out: schedule one per-user action for digest-eligible users. */
export const checkDigest = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const users = await ctx.runQuery(internal.reminders.getAllUsers);
    const now = Date.now();

    for (const user of users) {
      if (!user.digestTime || !user.telegramChatId) continue;
      if (user.lastDigestSentAt && now - user.lastDigestSentAt < 20 * 60 * 60 * 1000) continue;

      await ctx.scheduler.runAfter(0, internal.reminders.checkDigestForUser, {
        userId: user._id,
        chatId: user.telegramChatId,
        timezone: user.timezone ?? "America/Chicago",
        digestTime: user.digestTime,
      });
    }
    return null;
  },
});

export const checkDigestForUser = internalAction({
  args: {
    userId: v.id("users"),
    chatId: v.string(),
    timezone: v.string(),
    digestTime: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { userId, chatId, timezone, digestTime }) => {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "numeric",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour12: false,
    });
    const parts = fmt.formatToParts(now);
    const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value ?? "0");
    const nowHour = get("hour");
    const nowMinute = get("minute");

    const [h, m] = digestTime.split(":").map(Number);
    if (Math.abs(nowHour * 60 + nowMinute - (h * 60 + m)) > 15) return null;

    const nowSecond = now.getUTCSeconds();
    const elapsedMs = (nowHour * 3600 + nowMinute * 60 + nowSecond) * 1000 + now.getMilliseconds();
    const todayStart = new Date(now.getTime() - elapsedMs);
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

    const counts = await ctx.runQuery(internal.reminders.getDigestCounts, {
      userId,
      todayStart: todayStart.getTime(),
      todayEnd: todayEnd.getTime(),
    });

    if (counts.length === 0) return null;

    const lines = counts.map(
      (c: { workstream: Workstream; total: number; high: number }) =>
        `${c.workstream.charAt(0).toUpperCase() + c.workstream.slice(1)}: ${c.total} task${c.total > 1 ? "s" : ""}${c.high > 0 ? ` (${c.high} high priority)` : ""}`,
    );

    await ctx.runAction(internal.telegram.sendTextMessage, {
      chatId,
      text: `Good morning! Here's your day:\n${lines.join("\n")}`,
    });

    await ctx.runMutation(internal.reminders.markDigestSent, { userId });
    return null;
  },
});

// ── Internal mutations ───────────────────────────────

export const markReminderSent = internalMutation({
  args: { taskId: v.id("tasks") },
  returns: v.null(),
  handler: async (ctx, { taskId }) => {
    const task = await ctx.db.get(taskId);
    if (!task) return null; // task deleted between action read and this mutation
    await ctx.db.patch(taskId, { reminderSent: true });
    return null;
  },
});

export const markDigestSent = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    await ctx.db.patch(userId, { lastDigestSentAt: Date.now() });
    return null;
  },
});
