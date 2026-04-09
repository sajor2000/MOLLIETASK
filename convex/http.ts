import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  formatTaskList,
  formatTaskConfirmation,
  formatEditConfirmation,
  formatSnoozeConfirmation,
  HELP_TEXT,
} from "./telegramFormat";

const SNOOZE_DURATION_MS = 60 * 60 * 1000; // 1 hour — matches "Snooze 1hr" button label

const TZ_SHORTCUTS: Record<string, string> = {
  eastern: "America/New_York",
  central: "America/Chicago",
  mountain: "America/Denver",
  pacific: "America/Los_Angeles",
  alaska: "America/Anchorage",
  hawaii: "Pacific/Honolulu",
};

// Regex for detecting date/time indicators that benefit from AI parsing
const DATE_TIME_PATTERN = /\b(today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next\s+\w+|in\s+\d+\s+\w+|\d{1,2}[:/]\d{2}|\d{1,2}\s*(am|pm)|morning|afternoon|evening|daily|weekly|monthly|weekdays|every\s+\w+)\b/i;

// ── Telegram webhook body type ─────────────────────

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

// Build the AI-compatible task context array from Telegram task query results
function buildTaskContext(tasks: Array<{ title: string; workstream: string; status: string; dueDate?: number }>) {
  return tasks.map((t, i) => ({
    index: i,
    title: t.title,
    workstream: t.workstream as "practice" | "personal" | "family",
    status: t.status as "todo" | "inprogress" | "done",
    ...(t.dueDate ? { dueDateStr: new Date(t.dueDate).toISOString().slice(0, 10) } : {}),
  }));
}

// Build a typed edit patch from AI-parsed fields — uses !== undefined/null to preserve falsy values
function buildEditPatch(fields: {
  title?: string | null;
  workstream?: "practice" | "personal" | "family" | null;
  priority?: "high" | "normal" | null;
  dueDate?: string | null;
  dueTime?: string | null;
  notes?: string | null;
  recurring?: "daily" | "weekdays" | "weekly" | "monthly" | null;
}) {
  return {
    ...(fields.title !== undefined && fields.title !== null ? { title: fields.title } : {}),
    ...(fields.workstream !== undefined && fields.workstream !== null ? { workstream: fields.workstream } : {}),
    ...(fields.priority !== undefined && fields.priority !== null ? { priority: fields.priority } : {}),
    ...(fields.dueDate !== undefined && fields.dueDate !== null ? { dueDate: new Date(fields.dueDate).getTime() } : {}),
    ...(fields.dueTime !== undefined && fields.dueTime !== null ? { dueTime: fields.dueTime } : {}),
    ...(fields.notes !== undefined && fields.notes !== null ? { notes: fields.notes } : {}),
    ...(fields.recurring !== undefined && fields.recurring !== null ? { recurring: fields.recurring } : {}),
  };
}

/** Build staff context for AI parsing and resolve assignedStaffIndex to ID. */
type StaffRow = { _id: Id<"staffMembers">; name: string; roleTitle: string; sortOrder: number };
function buildStaffContext(staff: StaffRow[]) {
  return staff.map((s, i) => ({ index: i, name: s.name, roleTitle: s.roleTitle }));
}
function resolveStaffId(
  staff: StaffRow[],
  assignedStaffIndex: number | null | undefined,
): Id<"staffMembers"> | undefined {
  if (typeof assignedStaffIndex !== "number") return undefined;
  return staff[assignedStaffIndex]?._id;
}

/** Validate a Convex-style ID string (alphanumeric + underscore-like chars) */
function isValidConvexId(id: string): boolean {
  return /^[a-z0-9][a-z0-9_]*$/i.test(id) && id.length > 0 && id.length < 64;
}

// Shared fallback: add task using simple regex parsing (no AI)
type FallbackAddCtx = {
  runMutation: (ref: typeof internal.telegramBot.addTaskFromTelegram, args: {
    userId: Id<"users">;
    title: string;
    workstream: "practice" | "personal" | "family";
    priority: "high" | "normal";
  }) => Promise<Id<"tasks">>;
};
async function fallbackAdd(
  ctx: FallbackAddCtx,
  userId: Id<"users">,
  rawInput: string,
  defaultWorkstream: "practice" | "personal" | "family",
  reply: (chatId: string, text: string) => Promise<void>,
  chatId: string,
) {
  const parsed = parseAddCommand(rawInput);
  const workstream = parsed.workstream ?? defaultWorkstream;
  const priority = parsed.priority ?? "normal";
  const title = (parsed.title || rawInput).slice(0, 200);
  await ctx.runMutation(internal.telegramBot.addTaskFromTelegram, {
    userId,
    title,
    workstream,
    priority,
  });
  await reply(chatId, formatTaskConfirmation("added", title, workstream));
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
    if (req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== secret) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = (await req.json()) as TelegramWebhookBody;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    // Helper to send a text reply via the centralized sendTextMessage action
    const reply = async (chatId: string, text: string) => {
      if (!botToken) return;
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
          const taskId = rawId as Id<"tasks">;
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
            console.error("Failed to complete task from callback:", { rawId, chatId, error: e });
          }
        }
      } else if (data.startsWith("snooze:")) {
        const rawId = data.slice(7);
        if (isValidConvexId(rawId)) {
          const taskId = rawId as Id<"tasks">;
          try {
            const result = await ctx.runMutation(internal.telegramBot.snoozeTask, {
              userId: user._id,
              taskId,
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

      // Acknowledge callback to Telegram via centralized module
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

    // /add {text} — use AI only when date/time/recurring indicators are present
    if (text.startsWith("/add ")) {
      const rawInput = text.slice(5).trim();
      if (!rawInput) {
        await reply(chatId, "Usage: /add Buy supplies tomorrow @practice !high");
        return new Response("OK", { status: 200 });
      }

      const defaultWorkstream = user.lastUsedWorkstream ?? "personal";
      const needsAI = DATE_TIME_PATTERN.test(rawInput);

      if (!needsAI) {
        // Fast path: no date/time indicators, skip AI
        await fallbackAdd(ctx, user._id, rawInput, defaultWorkstream, reply, chatId);
        return new Response("OK", { status: 200 });
      }

      try {
        const today = new Date().toISOString().slice(0, 10);
        const staff = await ctx.runQuery(internal.telegramBot.getStaffForTelegram, { userId: user._id });
        const aiResult = await ctx.runAction(internal.aiActions.parseTaskIntentInternal, {
          userId: user._id,
          input: rawInput,
          taskContext: [],
          staffContext: buildStaffContext(staff),
          todayDate: today,
        });

        if (aiResult.fields) {
          const workstream = aiResult.fields.workstream ?? defaultWorkstream;
          const priority = aiResult.fields.priority ?? "normal";
          const title = (aiResult.fields.title ?? rawInput).slice(0, 200);
          const assignedStaffId = resolveStaffId(staff, aiResult.fields.assignedStaffIndex);

          await ctx.runMutation(internal.telegramBot.addTaskFromTelegram, {
            userId: user._id,
            title,
            workstream,
            priority,
            ...(aiResult.fields.dueDate ? { dueDate: new Date(aiResult.fields.dueDate).getTime() } : {}),
            ...(aiResult.fields.dueTime ? { dueTime: aiResult.fields.dueTime } : {}),
            ...(aiResult.fields.notes ? { notes: aiResult.fields.notes } : {}),
            ...(aiResult.fields.recurring ? { recurring: aiResult.fields.recurring } : {}),
            ...(assignedStaffId ? { assignedStaffId } : {}),
          });
          await reply(chatId, formatTaskConfirmation("added", title, workstream));
        } else {
          await fallbackAdd(ctx, user._id, rawInput, defaultWorkstream, reply, chatId);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "";
        if (msg.includes("Rate limited")) {
          await reply(chatId, msg);
        } else {
          await fallbackAdd(ctx, user._id, rawInput, defaultWorkstream, reply, chatId);
        }
      }
      return new Response("OK", { status: 200 });
    }

    // /tasks — list open tasks
    if (text === "/tasks") {
      const tasks = await ctx.runQuery(internal.telegramBot.getTasksForTelegram, {
        userId: user._id,
      });
      await reply(chatId, formatTaskList(tasks, user.timezone));
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
        const staff = await ctx.runQuery(internal.telegramBot.getStaffForTelegram, { userId: user._id });
        const aiResult = await ctx.runAction(internal.aiActions.parseTaskIntentInternal, {
          userId: user._id,
          input: `edit task ${taskNum}: ${changeText}`,
          taskContext: buildTaskContext(tasks),
          staffContext: buildStaffContext(staff),
          todayDate: today,
        });

        if (aiResult.intent === "edit" && aiResult.fields) {
          const assignedStaffId = resolveStaffId(staff, aiResult.fields.assignedStaffIndex);
          const result = await ctx.runMutation(internal.telegramBot.editTaskFromTelegram, {
            userId: user._id,
            taskId: targetTask._id as Id<"tasks">,
            ...buildEditPatch(aiResult.fields),
            ...(assignedStaffId ? { assignedStaffId } : {}),
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

    // /subtasks {number} — list subtasks for a task
    if (text.startsWith("/subtasks ")) {
      const num = parseInt(text.slice(10).trim(), 10);
      const tasks = await ctx.runQuery(internal.telegramBot.getTasksForTelegram, {
        userId: user._id,
      });

      if (isNaN(num) || num < 1 || num > tasks.length) {
        await reply(chatId, `Task #${num} not found. Use /tasks to see your list.`);
        return new Response("OK", { status: 200 });
      }

      const target = tasks[num - 1];
      const subtasks = await ctx.runQuery(internal.telegramBot.getSubtasksForTelegram, {
        userId: user._id,
        taskId: target._id,
      });

      if (subtasks.length === 0) {
        await reply(chatId, `"${target.title}" has no subtasks.\nAdd one: /addsub ${num} <title>`);
        return new Response("OK", { status: 200 });
      }

      const done = subtasks.filter((s: (typeof subtasks)[number]) => s.isComplete).length;
      const lines = [`\u{1F4CB} "${target.title}" (${done}/${subtasks.length} done):`];
      subtasks.forEach((s: (typeof subtasks)[number], i: number) => {
        const check = s.isComplete ? "\u2705" : "\u2B1C";
        lines.push(`  ${i + 1}. ${check} ${s.title}`);
      });
      lines.push(`\nToggle: /donesub ${num}.<subNum>`);
      await reply(chatId, lines.join("\n"));
      return new Response("OK", { status: 200 });
    }

    // /addsub {taskNum} {title} — add a subtask
    if (text.startsWith("/addsub ")) {
      const arg = text.slice(8).trim();
      const match = arg.match(/^(\d+)\s+(.+)$/);
      if (!match) {
        await reply(chatId, "Usage: /addsub 3 Order supplies");
        return new Response("OK", { status: 200 });
      }

      const taskNum = parseInt(match[1], 10);
      const subTitle = match[2].trim();

      const tasks = await ctx.runQuery(internal.telegramBot.getTasksForTelegram, {
        userId: user._id,
      });

      if (taskNum < 1 || taskNum > tasks.length) {
        await reply(chatId, `Task #${taskNum} not found. Use /tasks to see your list.`);
        return new Response("OK", { status: 200 });
      }

      try {
        const result = await ctx.runMutation(internal.telegramBot.addSubtaskFromTelegram, {
          userId: user._id,
          taskId: tasks[taskNum - 1]._id,
          title: subTitle.slice(0, 200),
        });
        if (result.success) {
          await reply(chatId, `\u2795 Added subtask to "${tasks[taskNum - 1].title}": ${result.title}`);
        } else {
          await reply(chatId, "Could not add subtask.");
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Failed to add subtask";
        await reply(chatId, msg);
      }
      return new Response("OK", { status: 200 });
    }

    // /donesub {taskNum}.{subNum} — toggle a subtask
    if (text.startsWith("/donesub ")) {
      const arg = text.slice(9).trim();
      const match = arg.match(/^(\d+)\.(\d+)$/);
      if (!match) {
        await reply(chatId, "Usage: /donesub 3.1 (task #3, subtask #1)");
        return new Response("OK", { status: 200 });
      }

      const taskNum = parseInt(match[1], 10);
      const subNum = parseInt(match[2], 10);

      const tasks = await ctx.runQuery(internal.telegramBot.getTasksForTelegram, {
        userId: user._id,
      });

      if (taskNum < 1 || taskNum > tasks.length) {
        await reply(chatId, `Task #${taskNum} not found. Use /tasks to see your list.`);
        return new Response("OK", { status: 200 });
      }

      const subtasks = await ctx.runQuery(internal.telegramBot.getSubtasksForTelegram, {
        userId: user._id,
        taskId: tasks[taskNum - 1]._id,
      });

      if (subNum < 1 || subNum > subtasks.length) {
        await reply(chatId, `Subtask #${subNum} not found. Use /subtasks ${taskNum} to see the list.`);
        return new Response("OK", { status: 200 });
      }

      const result = await ctx.runMutation(internal.telegramBot.toggleSubtaskFromTelegram, {
        userId: user._id,
        subtaskId: subtasks[subNum - 1]._id,
      });

      if (result.success) {
        const emoji = result.isComplete ? "\u2705" : "\u2B1C";
        await reply(chatId, `${emoji} ${result.title}`);
      } else {
        await reply(chatId, "Could not toggle subtask.");
      }
      return new Response("OK", { status: 200 });
    }

    // /delete {number|text} — delete a task
    if (text.startsWith("/delete ")) {
      const arg = text.slice(8).trim();
      if (!arg) {
        await reply(chatId, "Usage: /delete 3 or /delete Buy supplies");
        return new Response("OK", { status: 200 });
      }

      const tasks = await ctx.runQuery(internal.telegramBot.getTasksForTelegram, {
        userId: user._id,
      });

      let taskToDelete: (typeof tasks)[number] | undefined;
      const num = parseInt(arg, 10);
      if (!isNaN(num) && num >= 1 && num <= tasks.length) {
        taskToDelete = tasks[num - 1];
      } else {
        const lower = arg.toLowerCase();
        taskToDelete = tasks.find((t: (typeof tasks)[number]) => t.title.toLowerCase().includes(lower));
      }

      if (!taskToDelete) {
        await reply(chatId, `No matching task found for "${arg}". Use /tasks to see your list.`);
        return new Response("OK", { status: 200 });
      }

      const result = await ctx.runMutation(
        internal.telegramBot.deleteTaskFromTelegram,
        { userId: user._id, taskId: taskToDelete._id },
      );
      if (result.success) {
        await reply(chatId, formatTaskConfirmation("deleted", result.title, result.workstream));
      } else {
        await reply(chatId, "Could not delete that task.");
      }
      return new Response("OK", { status: 200 });
    }

    // /today — show tasks due today
    if (text === "/today") {
      const tz = user.timezone ?? "America/Chicago";
      const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: tz }); // YYYY-MM-DD

      const tasks = await ctx.runQuery(internal.telegramBot.getTasksForTelegram, {
        userId: user._id,
      });

      const todayTasks = tasks.filter((t: (typeof tasks)[number]) => {
        if (!t.dueDate) return false;
        const taskDateStr = new Date(t.dueDate).toLocaleDateString("en-CA", { timeZone: tz });
        return taskDateStr === todayStr;
      });

      const overdue = tasks.filter((t: (typeof tasks)[number]) => {
        if (!t.dueDate) return false;
        const taskDateStr = new Date(t.dueDate).toLocaleDateString("en-CA", { timeZone: tz });
        return taskDateStr < todayStr;
      });

      const lines: string[] = [];
      if (overdue.length > 0) {
        lines.push(`\u{1F534} Overdue (${overdue.length})`);
        overdue.forEach((t: (typeof overdue)[number], i: number) => {
          const pri = t.priority === "high" ? "[!] " : "";
          lines.push(`  ${i + 1}. ${pri}${t.title}`);
        });
        lines.push("");
      }

      if (todayTasks.length > 0) {
        lines.push(`\u{1F4C5} Today (${todayTasks.length})`);
        todayTasks.forEach((t: (typeof todayTasks)[number], i: number) => {
          const pri = t.priority === "high" ? "[!] " : "";
          const time = t.dueTime ? ` \u00b7 ${t.dueTime}` : "";
          lines.push(`  ${i + 1}. ${pri}${t.title}${time}`);
        });
      }

      if (lines.length === 0) {
        await reply(chatId, "Nothing due today. Nice work!");
      } else {
        await reply(chatId, lines.join("\n"));
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
      const staff = await ctx.runQuery(internal.telegramBot.getStaffForTelegram, { userId: user._id });

      const aiResult = await ctx.runAction(internal.aiActions.parseTaskIntentInternal, {
        userId: user._id,
        input: text,
        taskContext: buildTaskContext(tasks),
        staffContext: buildStaffContext(staff),
        todayDate: today,
      });

      if (aiResult.intent === "add" && aiResult.fields) {
        const workstream = aiResult.fields.workstream ?? user.lastUsedWorkstream ?? "personal";
        const priority = aiResult.fields.priority ?? "normal";
        const title = (aiResult.fields.title ?? text).slice(0, 200);
        const assignedStaffId = resolveStaffId(staff, aiResult.fields.assignedStaffIndex);

        await ctx.runMutation(internal.telegramBot.addTaskFromTelegram, {
          userId: user._id,
          title,
          workstream,
          priority,
          ...(aiResult.fields.dueDate ? { dueDate: new Date(aiResult.fields.dueDate).getTime() } : {}),
          ...(aiResult.fields.dueTime ? { dueTime: aiResult.fields.dueTime } : {}),
          ...(aiResult.fields.notes ? { notes: aiResult.fields.notes } : {}),
          ...(aiResult.fields.recurring ? { recurring: aiResult.fields.recurring } : {}),
          ...(assignedStaffId ? { assignedStaffId } : {}),
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
          const assignedStaffId = resolveStaffId(staff, aiResult.fields.assignedStaffIndex);
          const result = await ctx.runMutation(internal.telegramBot.editTaskFromTelegram, {
            userId: user._id,
            taskId: target._id as Id<"tasks">,
            ...buildEditPatch(aiResult.fields),
            ...(assignedStaffId ? { assignedStaffId } : {}),
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
        await fallbackAdd(ctx, user._id, text, user.lastUsedWorkstream ?? "personal", reply, chatId);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("Rate limited")) {
        await reply(chatId, msg);
      } else {
        await fallbackAdd(ctx, user._id, text, user.lastUsedWorkstream ?? "personal", reply, chatId);
      }
    }

    return new Response("OK", { status: 200 });
  }),
});

export default http;
