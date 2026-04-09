import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { workstreamValidator } from "./schema";

const TELEGRAM_API = "https://api.telegram.org/bot";

export const sendReminderMessage = internalAction({
  args: {
    chatId: v.string(),
    taskId: v.id("tasks"),
    title: v.string(),
    workstream: workstreamValidator,
    dueTime: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (_, { chatId, taskId, title, workstream, dueTime }) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      console.error("TELEGRAM_BOT_TOKEN not set");
      return null;
    }

    const timeStr = dueTime ? ` \u00b7 Due ${dueTime}` : "";
    const text = `\ud83d\udccb ${title}\n${workstream}${timeStr}`;

    const response = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "Mark Done", callback_data: `done:${taskId}` },
              { text: "Snooze 1hr", callback_data: `snooze:${taskId}` },
            ],
          ],
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`Telegram API error ${response.status}: ${body}`);
    }

    return null;
  },
});

export const answerCallbackQuery = internalAction({
  args: {
    callbackQueryId: v.string(),
  },
  returns: v.null(),
  handler: async (_, { callbackQueryId }) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return null;

    await fetch(`${TELEGRAM_API}${token}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQueryId }),
    });

    return null;
  },
});

export const sendTextMessage = internalAction({
  args: {
    chatId: v.string(),
    text: v.string(),
  },
  returns: v.null(),
  handler: async (_, { chatId, text }) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      console.error("TELEGRAM_BOT_TOKEN not set");
      return null;
    }

    const response = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`Telegram API error ${response.status}: ${body}`);
    }

    return null;
  },
});
