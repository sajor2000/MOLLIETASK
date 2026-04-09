import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { auth } from "./auth";
import {
  formatTaskList,
  formatTaskConfirmation,
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
        taskToComplete = tasks.find((t) => t.title.toLowerCase().includes(lower));
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

    // /help
    if (text === "/help") {
      await reply(chatId, HELP_TEXT);
      return new Response("OK", { status: 200 });
    }

    // Unknown command
    if (text.startsWith("/")) {
      await reply(chatId, `Unknown command.\n\n${HELP_TEXT}`);
    }

    return new Response("OK", { status: 200 });
  }),
});

export default http;
