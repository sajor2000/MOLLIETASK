import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { auth } from "./auth";
import {
  formatTaskList,
  formatTaskConfirmation,
  formatEditConfirmation,
  formatSnoozeConfirmation,
  HELP_TEXT,
} from "./telegramFormat";

const SNOOZE_DURATION_MS = 60 * 60 * 1000; // 1 hour — matches "Snooze 1hr" button label

// ── Helpers ─────────────────────────────────────────

function parseAddCommand(text: string): {
  title: string;
  workstream?: "practice" | "personal" | "family";
  priority?: "high" | "normal";
} {
  const WORKSTREAMS = new Set(["practice", "personal", "family"]);
  const words = text.split(/\s+/);
  let workstream: "practice" | "personal" | "family" | undefined;
  let priority: "high" | "normal" | undefined;
  const titleWords: string[] = [];

  for (const w of words) {
    if (w.startsWith("@") && WORKSTREAMS.has(w.slice(1).toLowerCase())) {
      workstream = w.slice(1).toLowerCase() as "practice" | "personal" | "family";
    } else if (w === "!high") {
      priority = "high";
    } else {
      titleWords.push(w);
    }
  }

  return { title: titleWords.join(" "), workstream, priority };
}

// ── HTTP Router ─────────────────────────────────────

const http = httpRouter();

// Convex Auth routes
auth.addHttpRoutes(http);

// Telegram webhook — handles text commands and callback queries
http.route({
  path: "/telegram/webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    // Fail closed: reject if webhook secret is not configured
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!secret) {
      return new Response("Webhook secret not configured", { status: 500 });
    }
    if (req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== secret) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = await req.json();
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    // Helper to send a text reply via the centralized sendTextMessage action
    const reply = async (chatId: string, text: string) => {
      if (!botToken) return;
      await ctx.runAction(internal.telegram.sendTextMessage, { chatId, text });
    };

    // ── Callback queries (inline keyboard buttons) ──────
    const callbackQuery = body?.callback_query;
    if (callbackQuery?.data) {
      const data = callbackQuery.data as string;
      const chatId = String(callbackQuery.message?.chat?.id ?? "");

      const user = chatId
        ? await ctx.runQuery(internal.telegramBot.getUserByChatId, { chatId })
        : null;

      if (data.startsWith("done:") && user) {
        const taskId = data.slice(5) as Id<"tasks">;
        try {
          const result = await ctx.runMutation(
            internal.telegramBot.completeTaskFromTelegram,
            { userId: user._id, taskId },
          );
          if (result.success) {
            const msg = formatTaskConfirmation("completed", result.title, result.workstream);
            const extra = result.wasRecurring ? "\nNext occurrence created." : "";
            await reply(chatId, msg + extra);
          }
        } catch (e) {
          console.error("Failed to complete task from callback:", { taskId, chatId, error: e });
        }
      } else if (data.startsWith("snooze:") && user) {
        const taskId = data.slice(7) as Id<"tasks">;
        try {
          const result = await ctx.runMutation(internal.telegramBot.snoozeTask, {
            userId: user._id,
            taskId,
            durationMs: SNOOZE_DURATION_MS,
          });
          if (result.success) {
            await reply(chatId, formatSnoozeConfirmation(result.title, result.newReminderAt));
          }
        } catch (e) {
          console.error("Failed to snooze task from callback:", { taskId, chatId, error: e });
        }
      }

      // Acknowledge callback to Telegram (fire-and-forget)
      if (botToken && callbackQuery.id) {
        await fetch(
          `https://api.telegram.org/bot${botToken}/answerCallbackQuery`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ callback_query_id: callbackQuery.id }),
          },
        );
      }

      return new Response("OK", { status: 200 });
    }

    // ── Text commands ───────────────────────────────────
    const message = body?.message;
    const text = (message?.text ?? "").trim();
    const chatId = String(message?.chat?.id ?? "");

    if (!text || !chatId) {
      return new Response("OK", { status: 200 });
    }

    // /start {token} — link Telegram account
    if (text.startsWith("/start ")) {
      const token = text.slice(7).trim();
      if (token) {
        const linked = await ctx.runMutation(internal.users.linkTelegram, {
          token,
          chatId,
        });
        await reply(
          chatId,
          linked
            ? "Linked! You'll receive task reminders here."
            : "Invalid or expired link token. Generate a new one in Settings.",
        );
      }
      return new Response("OK", { status: 200 });
    }

    // All other commands require a linked user
    const user = await ctx.runQuery(internal.telegramBot.getUserByChatId, { chatId });
    if (!user) {
      await reply(chatId, "Account not linked. Use /start {token} from the app.");
      return new Response("OK", { status: 200 });
    }

    // /add {title} [@workstream] [!high]
    if (text.startsWith("/add ")) {
      const parsed = parseAddCommand(text.slice(5).trim());
      if (!parsed.title) {
        await reply(chatId, "Usage: /add Buy supplies @practice !high");
        return new Response("OK", { status: 200 });
      }
      const workstream = parsed.workstream ?? user.lastUsedWorkstream ?? "personal";
      const priority = parsed.priority ?? "normal";
      await ctx.runMutation(internal.telegramBot.addTaskFromTelegram, {
        userId: user._id,
        title: parsed.title,
        workstream,
        priority,
      });
      await reply(chatId, formatTaskConfirmation("added", parsed.title, workstream));
      return new Response("OK", { status: 200 });
    }

    // /tasks — list open tasks
    if (text === "/tasks") {
      const tasks = await ctx.runQuery(internal.telegramBot.getTasksForTelegram, {
        userId: user._id,
      });
      await reply(chatId, formatTaskList(tasks));
      return new Response("OK", { status: 200 });
    }

    // /done {number|text} — complete a task
    if (text.startsWith("/done ")) {
      const arg = text.slice(6).trim();
      if (!arg) {
        await reply(chatId, "Usage: /done 3 or /done Buy supplies");
        return new Response("OK", { status: 200 });
      }

      const tasks = await ctx.runQuery(internal.telegramBot.getTasksForTelegram, {
        userId: user._id,
      });

      let taskToComplete: (typeof tasks)[number] | undefined;
      const num = parseInt(arg, 10);
      if (!isNaN(num) && num >= 1 && num <= tasks.length) {
        taskToComplete = tasks[num - 1];
      } else {
        const lower = arg.toLowerCase();
        taskToComplete = tasks.find((t: (typeof tasks)[number]) => t.title.toLowerCase().includes(lower));
      }

      if (!taskToComplete) {
        await reply(chatId, `No matching task found for "${arg}". Use /tasks to see your list.`);
        return new Response("OK", { status: 200 });
      }

      const result = await ctx.runMutation(
        internal.telegramBot.completeTaskFromTelegram,
        { userId: user._id, taskId: taskToComplete._id },
      );
      if (result.success) {
        const msg = formatTaskConfirmation("completed", result.title, result.workstream);
        const extra = result.wasRecurring ? "\nNext occurrence created." : "";
        await reply(chatId, msg + extra);
      } else {
        await reply(chatId, "Could not complete that task. It may already be done.");
      }
      return new Response("OK", { status: 200 });
    }

    // /edit {number} {changes} — edit a task via AI
    if (text.startsWith("/edit ")) {
      const arg = text.slice(6).trim();
      const match = arg.match(/^(\d+)\s+(.+)$/);
      if (!match) {
        await reply(chatId, "Usage: /edit 3 change priority to high");
        return new Response("OK", { status: 200 });
      }

      const taskNum = parseInt(match[1], 10);
      const changeText = match[2];

      const tasks = await ctx.runQuery(internal.telegramBot.getTasksForTelegram, {
        userId: user._id,
      });

      if (taskNum < 1 || taskNum > tasks.length) {
        await reply(chatId, `Task #${taskNum} not found. Use /tasks to see your list.`);
        return new Response("OK", { status: 200 });
      }

      const targetTask = tasks[taskNum - 1];

      try {
        const today = new Date().toISOString().slice(0, 10);
        const taskContext = tasks.map((t: (typeof tasks)[number], i: number) => ({
          index: i,
          title: t.title,
          workstream: t.workstream,
          status: t.status,
          ...(t.dueDate ? { dueDateStr: new Date(t.dueDate).toISOString().slice(0, 10) } : {}),
        }));

        const aiResult = await ctx.runAction(internal.aiActions.parseTaskIntentInternal, {
          userId: user._id,
          input: `edit task ${taskNum}: ${changeText}`,
          taskContext,
          todayDate: today,
        });

        if (aiResult.intent === "edit" && aiResult.fields) {
          const updates: Record<string, unknown> = {};
          if (aiResult.fields.title) updates.title = aiResult.fields.title;
          if (aiResult.fields.workstream) updates.workstream = aiResult.fields.workstream;
          if (aiResult.fields.priority) updates.priority = aiResult.fields.priority;
          if (aiResult.fields.dueDate) {
            updates.dueDate = new Date(aiResult.fields.dueDate).getTime();
          }
          if (aiResult.fields.dueTime) updates.dueTime = aiResult.fields.dueTime;
          if (aiResult.fields.notes) updates.notes = aiResult.fields.notes;

          const result = await ctx.runMutation(internal.telegramBot.editTaskFromTelegram, {
            userId: user._id,
            taskId: targetTask._id as Id<"tasks">,
            ...updates,
          });

          if (result.success) {
            await reply(chatId, formatEditConfirmation(result.title, result.changes));
          } else {
            await reply(chatId, "Could not edit that task.");
          }
        } else {
          await reply(chatId, "Could not understand the edit. Try: /edit 3 change priority to high");
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "";
        if (msg.includes("Rate limited")) {
          await reply(chatId, msg);
        } else {
          await reply(chatId, "Could not process edit. Try again.");
        }
      }
      return new Response("OK", { status: 200 });
    }

    // /timezone [value] — view or set timezone
    if (text === "/timezone" || text.startsWith("/timezone ")) {
      const arg = text.slice(10).trim();
      if (!arg) {
        const tz = user.timezone ?? "America/Chicago";
        await reply(chatId, `Current timezone: ${tz}`);
        return new Response("OK", { status: 200 });
      }

      const TZ_SHORTCUTS: Record<string, string> = {
        eastern: "America/New_York",
        central: "America/Chicago",
        mountain: "America/Denver",
        pacific: "America/Los_Angeles",
        alaska: "America/Anchorage",
        hawaii: "Pacific/Honolulu",
      };
      const resolved = TZ_SHORTCUTS[arg.toLowerCase()] ?? arg;

      try {
        await ctx.runMutation(internal.telegramBot.updateSettingsFromTelegram, {
          userId: user._id,
          timezone: resolved,
        });
        await reply(chatId, `\u2705 Timezone set to ${resolved}`);
      } catch {
        await reply(chatId, "Invalid timezone. Try: Eastern, Central, Mountain, Pacific, or a full IANA name.");
      }
      return new Response("OK", { status: 200 });
    }

    // /digest [HH:MM|off] — view or set daily digest time
    if (text === "/digest" || text.startsWith("/digest ")) {
      const arg = text.slice(8).trim();
      if (!arg) {
        const dt = user.digestTime;
        await reply(chatId, dt ? `Daily digest at ${dt}` : "Daily digest is off.");
        return new Response("OK", { status: 200 });
      }

      if (arg.toLowerCase() === "off") {
        await ctx.runMutation(internal.telegramBot.updateSettingsFromTelegram, {
          userId: user._id,
          digestTime: "",
        });
        await reply(chatId, "\u2705 Daily digest disabled.");
        return new Response("OK", { status: 200 });
      }

      try {
        await ctx.runMutation(internal.telegramBot.updateSettingsFromTelegram, {
          userId: user._id,
          digestTime: arg,
        });
        await reply(chatId, `\u2705 Daily digest set to ${arg}`);
      } catch {
        await reply(chatId, "Invalid time. Use HH:MM format (e.g. 08:00).");
      }
      return new Response("OK", { status: 200 });
    }

    // /help
    if (text === "/help") {
      await reply(chatId, HELP_TEXT);
      return new Response("OK", { status: 200 });
    }

    // Unknown slash command
    if (text.startsWith("/")) {
      await reply(chatId, `Unknown command.\n\n${HELP_TEXT}`);
      return new Response("OK", { status: 200 });
    }

    // ── Free-text AI routing ──────────────────────────
    try {
      const today = new Date().toISOString().slice(0, 10);
      const tasks = await ctx.runQuery(internal.telegramBot.getTasksForTelegram, {
        userId: user._id,
      });
      const taskContext = tasks.map((t: (typeof tasks)[number], i: number) => ({
        index: i,
        title: t.title,
        workstream: t.workstream,
        status: t.status,
        ...(t.dueDate ? { dueDateStr: new Date(t.dueDate).toISOString().slice(0, 10) } : {}),
      }));

      const aiResult = await ctx.runAction(internal.aiActions.parseTaskIntentInternal, {
        userId: user._id,
        input: text,
        taskContext,
        todayDate: today,
      });

      if (aiResult.intent === "add" && aiResult.fields) {
        const workstream = aiResult.fields.workstream ?? user.lastUsedWorkstream ?? "personal";
        const priority = aiResult.fields.priority ?? "normal";
        const title = (aiResult.fields.title ?? text).slice(0, 200);

        await ctx.runMutation(internal.telegramBot.addTaskFromTelegram, {
          userId: user._id,
          title,
          workstream,
          priority,
          ...(aiResult.fields.dueDate ? { dueDate: new Date(aiResult.fields.dueDate).getTime() } : {}),
          ...(aiResult.fields.dueTime ? { dueTime: aiResult.fields.dueTime } : {}),
          ...(aiResult.fields.notes ? { notes: aiResult.fields.notes } : {}),
          ...(aiResult.fields.recurring ? { recurring: aiResult.fields.recurring } : {}),
        });
        await reply(chatId, formatTaskConfirmation("added", title, workstream));
      } else if (aiResult.intent === "complete" && aiResult.taskIndex !== undefined) {
        const target = tasks[aiResult.taskIndex];
        if (target) {
          const result = await ctx.runMutation(
            internal.telegramBot.completeTaskFromTelegram,
            { userId: user._id, taskId: target._id as Id<"tasks"> },
          );
          if (result.success) {
            const msg = formatTaskConfirmation("completed", result.title, result.workstream);
            const extra = result.wasRecurring ? "\nNext occurrence created." : "";
            await reply(chatId, msg + extra);
          } else {
            await reply(chatId, "Could not complete that task.");
          }
        } else {
          await reply(chatId, "Could not find the matching task.");
        }
      } else if (aiResult.intent === "edit" && aiResult.taskIndex !== undefined && aiResult.fields) {
        const target = tasks[aiResult.taskIndex];
        if (target) {
          const updates: Record<string, unknown> = {};
          if (aiResult.fields.title) updates.title = aiResult.fields.title;
          if (aiResult.fields.workstream) updates.workstream = aiResult.fields.workstream;
          if (aiResult.fields.priority) updates.priority = aiResult.fields.priority;
          if (aiResult.fields.dueDate) {
            updates.dueDate = new Date(aiResult.fields.dueDate).getTime();
          }
          if (aiResult.fields.dueTime) updates.dueTime = aiResult.fields.dueTime;
          if (aiResult.fields.notes) updates.notes = aiResult.fields.notes;

          const result = await ctx.runMutation(internal.telegramBot.editTaskFromTelegram, {
            userId: user._id,
            taskId: target._id as Id<"tasks">,
            ...updates,
          });
          if (result.success) {
            await reply(chatId, formatEditConfirmation(result.title, result.changes));
          } else {
            await reply(chatId, "Could not edit that task.");
          }
        } else {
          await reply(chatId, "Could not find the matching task.");
        }
      } else {
        // AI couldn't determine intent — fall back to simple add
        const workstream = user.lastUsedWorkstream ?? "personal";
        await ctx.runMutation(internal.telegramBot.addTaskFromTelegram, {
          userId: user._id,
          title: text.slice(0, 200),
          workstream,
          priority: "normal",
        });
        await reply(chatId, formatTaskConfirmation("added", text.slice(0, 200), workstream));
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("Rate limited")) {
        await reply(chatId, msg);
      } else {
        // Fallback: treat as simple task add
        const workstream = user.lastUsedWorkstream ?? "personal";
        await ctx.runMutation(internal.telegramBot.addTaskFromTelegram, {
          userId: user._id,
          title: text.slice(0, 200),
          workstream,
          priority: "normal",
        });
        await reply(chatId, formatTaskConfirmation("added", text.slice(0, 200), workstream));
      }
    }

    return new Response("OK", { status: 200 });
  }),
});

export default http;
