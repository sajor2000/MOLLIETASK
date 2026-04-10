import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { formatTaskConfirmation, formatSnoozeConfirmation, HELP_TEXT } from "./telegramFormat";
import {
  handleAddCommand,
  handleTasksCommand,
  handleDoneCommand,
  handleDeleteCommand,
  handleEditCommand,
  handleTimezoneCommand,
  handleDigestCommand,
  handleSubtasksCommand,
  handleAddSubCommand,
  handleDoneSubCommand,
  handleTodayCommand,
  handleSearchCommand,
  handleTemplatesCommand,
  handleUseTemplateCommand,
  handleFreeText,
} from "./telegramCommands";

/** Constant-time string comparison to prevent timing side-channel attacks. */
function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  const maxLen = Math.max(bufA.length, bufB.length);
  let result = bufA.length ^ bufB.length;
  for (let i = 0; i < maxLen; i++) {
    result |= (bufA[i] ?? 0) ^ (bufB[i] ?? 0);
  }
  return result === 0;
}

/** Validate a Convex-style ID string (alphanumeric + underscore-like chars) */
function isValidConvexId(id: string): boolean {
  return /^[a-z0-9][a-z0-9_]*$/i.test(id) && id.length > 0 && id.length < 64;
}

const SNOOZE_DURATION_MS = 60 * 60 * 1000; // 1 hour — matches "Snooze 1hr" button label

interface TelegramWebhookBody {
  callback_query?: {
    id: string;
    data?: string;
    message?: { chat?: { id: number } };
  };
  message?: {
    text?: string;
    chat?: { id: number };
  };
}

// ── HTTP Router ─────────────────────────────────────

const http = httpRouter();

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
    const token = req.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
    if (!timingSafeEqual(token, secret)) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = (await req.json()) as TelegramWebhookBody;

    // Helper to send a text reply via the centralized sendTextMessage action
    const reply = async (chatId: string, text: string) => {
      if (!process.env.TELEGRAM_BOT_TOKEN) return;
      await ctx.runAction(internal.telegram.sendTextMessage, { chatId, text });
    };

    // ── Callback queries (inline keyboard buttons) ──────
    const callbackQuery = body?.callback_query;
    if (callbackQuery?.data) {
      const data = callbackQuery.data;
      const chatId = String(callbackQuery.message?.chat?.id ?? "");

      const user = chatId
        ? await ctx.runQuery(internal.telegramBot.getUserByChatId, { chatId })
        : null;

      if (!user) {
        console.warn("Callback query from unlinked chat:", { chatId, data });
      } else if (data.startsWith("done:")) {
        const rawId = data.slice(5);
        if (isValidConvexId(rawId)) {
          try {
            const result = await ctx.runMutation(internal.telegramBot.completeTaskFromTelegram, {
              userId: user._id,
              taskId: rawId as Id<"tasks">,
            });
            if (result.success) {
              const extra = result.wasRecurring ? "\nNext occurrence created." : "";
              await reply(chatId, formatTaskConfirmation("completed", result.title, result.workstream) + extra);
            }
          } catch (e) {
            console.error("Failed to complete task from callback:", { rawId, chatId, error: e });
          }
        }
      } else if (data.startsWith("snooze:")) {
        const rawId = data.slice(7);
        if (isValidConvexId(rawId)) {
          try {
            const result = await ctx.runMutation(internal.telegramBot.snoozeTask, {
              userId: user._id,
              taskId: rawId as Id<"tasks">,
              durationMs: SNOOZE_DURATION_MS,
            });
            if (result.success) {
              await reply(chatId, formatSnoozeConfirmation(result.title, result.newReminderAt, user.timezone));
            }
          } catch (e) {
            console.error("Failed to snooze task from callback:", { rawId, chatId, error: e });
          }
        }
      }

      if (callbackQuery.id) {
        await ctx.runAction(internal.telegram.answerCallbackQuery, {
          callbackQueryId: callbackQuery.id,
        });
      }

      return new Response("OK", { status: 200 });
    }

    // ── Text commands ───────────────────────────────────
    const message = body?.message;
    const text = (message?.text ?? "").trim();
    const chatId = String(message?.chat?.id ?? "");

    if (!text || !chatId) return new Response("OK", { status: 200 });

    // /start {token} — link Telegram account (no user required)
    if (text.startsWith("/start ")) {
      const linkToken = text.slice(7).trim();
      if (linkToken) {
        const linked = await ctx.runMutation(internal.users.linkTelegram, { token: linkToken, chatId });
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

    // ── Command dispatch ────────────────────────────────

    if (text.startsWith("/add ")) {
      const rawInput = text.slice(5).trim();
      if (!rawInput) { await reply(chatId, "Usage: /add Buy supplies tomorrow @practice !high"); }
      else { await handleAddCommand(ctx, user, rawInput, reply, chatId); }
      return new Response("OK", { status: 200 });
    }

    if (text === "/tasks") {
      await handleTasksCommand(ctx, user, reply, chatId);
      return new Response("OK", { status: 200 });
    }

    if (text.startsWith("/done ")) {
      const arg = text.slice(6).trim();
      if (!arg) { await reply(chatId, "Usage: /done 3 or /done Buy supplies"); }
      else { await handleDoneCommand(ctx, user, arg, reply, chatId); }
      return new Response("OK", { status: 200 });
    }

    if (text.startsWith("/delete ")) {
      const arg = text.slice(8).trim();
      if (!arg) { await reply(chatId, "Usage: /delete 3 or /delete Buy supplies"); }
      else { await handleDeleteCommand(ctx, user, arg, reply, chatId); }
      return new Response("OK", { status: 200 });
    }

    if (text.startsWith("/edit ")) {
      await handleEditCommand(ctx, user, text.slice(6).trim(), reply, chatId);
      return new Response("OK", { status: 200 });
    }

    if (text === "/timezone" || text.startsWith("/timezone ")) {
      await handleTimezoneCommand(ctx, user, text.slice(10).trim(), reply, chatId);
      return new Response("OK", { status: 200 });
    }

    if (text === "/digest" || text.startsWith("/digest ")) {
      await handleDigestCommand(ctx, user, text.slice(8).trim(), reply, chatId);
      return new Response("OK", { status: 200 });
    }

    if (text.startsWith("/subtasks ")) {
      await handleSubtasksCommand(ctx, user, parseInt(text.slice(10).trim(), 10), reply, chatId);
      return new Response("OK", { status: 200 });
    }

    if (text.startsWith("/addsub ")) {
      await handleAddSubCommand(ctx, user, text.slice(8).trim(), reply, chatId);
      return new Response("OK", { status: 200 });
    }

    if (text.startsWith("/donesub ")) {
      await handleDoneSubCommand(ctx, user, text.slice(9).trim(), reply, chatId);
      return new Response("OK", { status: 200 });
    }

    if (text === "/today") {
      await handleTodayCommand(ctx, user, reply, chatId);
      return new Response("OK", { status: 200 });
    }

    if (text.startsWith("/search ")) {
      const query = text.slice(8).trim();
      if (!query) { await reply(chatId, "Usage: /search supplies"); }
      else { await handleSearchCommand(ctx, user, query, reply, chatId); }
      return new Response("OK", { status: 200 });
    }

    if (text === "/templates") {
      await handleTemplatesCommand(ctx, user, reply, chatId);
      return new Response("OK", { status: 200 });
    }

    if (text.startsWith("/use ")) {
      const arg = text.slice(5).trim();
      if (!arg) { await reply(chatId, "Usage: /use 3 or /use template name"); }
      else { await handleUseTemplateCommand(ctx, user, arg, reply, chatId); }
      return new Response("OK", { status: 200 });
    }

    if (text === "/help") {
      await reply(chatId, HELP_TEXT);
      return new Response("OK", { status: 200 });
    }

    if (text.startsWith("/")) {
      await reply(chatId, `Unknown command.\n\n${HELP_TEXT}`);
      return new Response("OK", { status: 200 });
    }

    // ── Free-text AI routing ────────────────────────────
    await handleFreeText(ctx, user, text, reply, chatId);
    return new Response("OK", { status: 200 });
  }),
});

export default http;
