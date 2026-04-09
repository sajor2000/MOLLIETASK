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

// ── Single user query (used by crons) ────────────────

export const getFirstUser = internalQuery({
  args: {},
  returns: v.union(
    v.object({
      _id: v.id("users"),
      telegramChatId: v.optional(v.string()),
      timezone: v.optional(v.string()),
      digestTime: v.optional(v.string()),
      lastDigestSentAt: v.optional(v.number()),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const user = await ctx.db.query("users").first();
    if (!user) return null;
    return {
      _id: user._id,
      telegramChatId: user.telegramChatId,
      timezone: user.timezone,
      digestTime: user.digestTime,
      lastDigestSentAt: user.lastDigestSentAt,
    };
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

export const checkOverdue = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const user = await ctx.runQuery(internal.reminders.getFirstUser);
    if (!user) return null;

    const now = Date.now();
    const overdue = await ctx.runQuery(internal.reminders.getOverdueTasks, {
      userId: user._id,
      now,
    });

    if (overdue.length === 0) return null;

    const message = `You have ${overdue.length} overdue task${overdue.length > 1 ? "s" : ""}`;

    if (user.telegramChatId) {
      await ctx.runAction(internal.telegram.sendTextMessage, {
        chatId: user.telegramChatId,
        text: message,
      });
    }

    return null;
  },
});

export const checkDigest = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const user = await ctx.runQuery(internal.reminders.getFirstUser);
    if (!user || !user.digestTime) return null;

    // Dedup: skip if sent within last 20 hours
    if (user.lastDigestSentAt && Date.now() - user.lastDigestSentAt < 20 * 60 * 60 * 1000) {
      return null;
    }

    // Compare in user's timezone using Intl.DateTimeFormat.formatToParts (reliable across runtimes)
    const tz = user.timezone ?? "America/Chicago";
    const now = new Date();
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
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

    const [h, m] = user.digestTime.split(":").map(Number);
    const digestMinutes = h * 60 + m;
    const nowMinutes = nowHour * 60 + nowMinute;

    if (Math.abs(nowMinutes - digestMinutes) > 15) return null;

    // Build today's start/end in user timezone using parsed parts
    const userYear = get("year");
    const userMonth = get("month");
    const userDay = get("day");
    const todayStart = new Date(`${userYear}-${String(userMonth).padStart(2, "0")}-${String(userDay).padStart(2, "0")}T00:00:00`);
    const todayEnd = new Date(`${userYear}-${String(userMonth).padStart(2, "0")}-${String(userDay).padStart(2, "0")}T23:59:59.999`);

    const counts = await ctx.runQuery(internal.reminders.getDigestCounts, {
      userId: user._id,
      todayStart: todayStart.getTime(),
      todayEnd: todayEnd.getTime(),
    });

    if (counts.length === 0) return null;

    const lines = counts.map(
      (c: { workstream: Workstream; total: number; high: number }) =>
        `${c.workstream.charAt(0).toUpperCase() + c.workstream.slice(1)}: ${c.total} task${c.total > 1 ? "s" : ""}${c.high > 0 ? ` (${c.high} high priority)` : ""}`,
    );

    const message = `Good morning! Here's your day:\n${lines.join("\n")}`;

    if (user.telegramChatId) {
      await ctx.runAction(internal.telegram.sendTextMessage, {
        chatId: user.telegramChatId,
        text: message,
      });
    }

    // Mark digest as sent today
    await ctx.runMutation(internal.reminders.markDigestSent, {
      userId: user._id,
    });

    return null;
  },
});

// ── Internal mutations ───────────────────────────────

export const markReminderSent = internalMutation({
  args: { taskId: v.id("tasks") },
  returns: v.null(),
  handler: async (ctx, { taskId }) => {
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
