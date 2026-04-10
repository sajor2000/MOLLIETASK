/**
 * Telegram command handlers — extracted from http.ts to keep the webhook
 * router thin and each command testable in isolation.
 *
 * Each handler accepts (ctx, user, ...args, reply, chatId) and returns void.
 * ctx is typed as ActionCtx from the generated server, which matches both
 * internalAction and httpAction contexts.
 */

import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  formatTaskList,
  formatTaskConfirmation,
  formatEditConfirmation,
  formatSnoozeConfirmation,
} from "./telegramFormat";
import { DEFAULT_TIMEZONE } from "./constants";

export type TelegramUser = {
  _id: Id<"users">;
  timezone?: string;
  digestTime?: string;
  lastUsedWorkstream?: "practice" | "personal" | "family";
};

export type ReplyFn = (chatId: string, text: string) => Promise<void>;

type TaskListItem = {
  _id: Id<"tasks">;
  title: string;
  workstream: string;
  status: string;
  dueDate?: number;
  priority?: string;
  dueTime?: string;
};

// ── Regex for date/time indicators ────────────────────
export const DATE_TIME_PATTERN =
  /\b(today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next\s+\w+|in\s+\d+\s+\w+|\d{1,2}[:/]\d{2}|\d{1,2}\s*(am|pm)|morning|afternoon|evening|daily|weekly|monthly|weekdays|every\s+\w+)\b/i;

export const TZ_SHORTCUTS: Record<string, string> = {
  eastern: "America/New_York",
  central: "America/Chicago",
  mountain: "America/Denver",
  pacific: "America/Los_Angeles",
  alaska: "America/Anchorage",
  hawaii: "Pacific/Honolulu",
};

const SNOOZE_DURATION_MS = 60 * 60 * 1000;

// ── Shared helpers ─────────────────────────────────────

export function parseAddCommand(text: string): {
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

export function buildTaskContext(
  tasks: Array<{ title: string; workstream: string; status: string; dueDate?: number }>,
) {
  return tasks.map((t, i) => ({
    index: i,
    title: t.title,
    workstream: t.workstream as "practice" | "personal" | "family",
    status: t.status as "todo" | "inprogress" | "done",
    ...(t.dueDate ? { dueDateStr: new Date(t.dueDate).toISOString().slice(0, 10) } : {}),
  }));
}

export function buildEditPatch(fields: {
  title?: string | null;
  workstream?: "practice" | "personal" | "family" | null;
  priority?: "high" | "normal" | null;
  dueDate?: string | null;
  dueTime?: string | null;
  notes?: string | null;
  recurring?: "daily" | "weekdays" | "weekly" | "monthly" | null;
}) {
  return {
    ...(fields.title != null ? { title: fields.title } : {}),
    ...(fields.workstream != null ? { workstream: fields.workstream } : {}),
    ...(fields.priority != null ? { priority: fields.priority } : {}),
    ...(fields.dueDate != null ? { dueDate: new Date(fields.dueDate).getTime() } : {}),
    ...(fields.dueTime != null ? { dueTime: fields.dueTime } : {}),
    ...(fields.notes != null ? { notes: fields.notes } : {}),
    ...(fields.recurring != null ? { recurring: fields.recurring } : {}),
  };
}

type FallbackCtx = Pick<ActionCtx, "runMutation">;

export async function fallbackAdd(
  ctx: FallbackCtx,
  userId: Id<"users">,
  rawInput: string,
  defaultWorkstream: "practice" | "personal" | "family",
  reply: ReplyFn,
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

// ── Command handlers ───────────────────────────────────

export async function handleAddCommand(
  ctx: ActionCtx,
  user: TelegramUser,
  rawInput: string,
  reply: ReplyFn,
  chatId: string,
) {
  const defaultWorkstream = user.lastUsedWorkstream ?? "personal";
  const needsAI = DATE_TIME_PATTERN.test(rawInput);

  if (!needsAI) {
    await fallbackAdd(ctx, user._id, rawInput, defaultWorkstream, reply, chatId);
    return;
  }

  try {
    const today = new Date().toISOString().slice(0, 10);
    const aiResult = await ctx.runAction(internal.aiActions.parseTaskIntentInternal, {
      userId: user._id,
      input: rawInput,
      taskContext: [],
      todayDate: today,
    });

    if (aiResult.fields) {
      const workstream = aiResult.fields.workstream ?? defaultWorkstream;
      const priority = aiResult.fields.priority ?? "normal";
      const title = (aiResult.fields.title ?? rawInput).slice(0, 200);

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
}

export async function handleTasksCommand(
  ctx: ActionCtx,
  user: TelegramUser,
  reply: ReplyFn,
  chatId: string,
) {
  const tasks = await ctx.runQuery(internal.telegramBot.getTasksForTelegram, {
    userId: user._id,
  });
  await reply(chatId, formatTaskList(tasks, user.timezone));
}

export async function handleDoneCommand(
  ctx: ActionCtx,
  user: TelegramUser,
  arg: string,
  reply: ReplyFn,
  chatId: string,
) {
  const tasks = await ctx.runQuery(internal.telegramBot.getTasksForTelegram, { userId: user._id });

  const num = parseInt(arg, 10);
  const taskToComplete =
    !isNaN(num) && num >= 1 && num <= tasks.length
      ? tasks[num - 1]
      : tasks.find((t: TaskListItem) => t.title.toLowerCase().includes(arg.toLowerCase()));

  if (!taskToComplete) {
    await reply(chatId, `No matching task found for "${arg}". Use /tasks to see your list.`);
    return;
  }

  const result = await ctx.runMutation(internal.telegramBot.completeTaskFromTelegram, {
    userId: user._id,
    taskId: taskToComplete._id,
  });
  if (result.success) {
    const extra = result.wasRecurring ? "\nNext occurrence created." : "";
    await reply(chatId, formatTaskConfirmation("completed", result.title, result.workstream) + extra);
  } else {
    await reply(chatId, "Could not complete that task. It may already be done.");
  }
}

export async function handleDeleteCommand(
  ctx: ActionCtx,
  user: TelegramUser,
  arg: string,
  reply: ReplyFn,
  chatId: string,
) {
  const tasks = await ctx.runQuery(internal.telegramBot.getTasksForTelegram, { userId: user._id });

  const num = parseInt(arg, 10);
  const taskToDelete =
    !isNaN(num) && num >= 1 && num <= tasks.length
      ? tasks[num - 1]
      : tasks.find((t: TaskListItem) => t.title.toLowerCase().includes(arg.toLowerCase()));

  if (!taskToDelete) {
    await reply(chatId, `No matching task found for "${arg}". Use /tasks to see your list.`);
    return;
  }

  const result = await ctx.runMutation(internal.telegramBot.deleteTaskFromTelegram, {
    userId: user._id,
    taskId: taskToDelete._id,
  });
  if (result.success) {
    await reply(chatId, formatTaskConfirmation("deleted", result.title, result.workstream));
  } else {
    await reply(chatId, "Could not delete that task.");
  }
}

export async function handleEditCommand(
  ctx: ActionCtx,
  user: TelegramUser,
  arg: string,
  reply: ReplyFn,
  chatId: string,
) {
  const match = arg.match(/^(\d+)\s+(.+)$/);
  if (!match) {
    await reply(chatId, "Usage: /edit 3 change priority to high");
    return;
  }

  const taskNum = parseInt(match[1], 10);
  const changeText = match[2];
  const tasks = await ctx.runQuery(internal.telegramBot.getTasksForTelegram, { userId: user._id });

  if (taskNum < 1 || taskNum > tasks.length) {
    await reply(chatId, `Task #${taskNum} not found. Use /tasks to see your list.`);
    return;
  }

  const targetTask = tasks[taskNum - 1];

  try {
    const today = new Date().toISOString().slice(0, 10);
    const aiResult = await ctx.runAction(internal.aiActions.parseTaskIntentInternal, {
      userId: user._id,
      input: `edit task ${taskNum}: ${changeText}`,
      taskContext: buildTaskContext(tasks),
      todayDate: today,
    });

    if (aiResult.intent === "edit" && aiResult.fields) {
      const result = await ctx.runMutation(internal.telegramBot.editTaskFromTelegram, {
        userId: user._id,
        taskId: targetTask._id as Id<"tasks">,
        ...buildEditPatch(aiResult.fields),
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
}

export async function handleTimezoneCommand(
  ctx: ActionCtx,
  user: TelegramUser,
  arg: string,
  reply: ReplyFn,
  chatId: string,
) {
  if (!arg) {
    await reply(chatId, `Current timezone: ${user.timezone ?? DEFAULT_TIMEZONE}`);
    return;
  }

  const resolved = TZ_SHORTCUTS[arg.toLowerCase()] ?? arg;
  try {
    await ctx.runMutation(internal.telegramBot.updateSettingsFromTelegram, {
      userId: user._id,
      timezone: resolved,
    });
    await reply(chatId, `✅ Timezone set to ${resolved}`);
  } catch {
    await reply(chatId, "Invalid timezone. Try: Eastern, Central, Mountain, Pacific, or a full IANA name.");
  }
}

export async function handleDigestCommand(
  ctx: ActionCtx,
  user: TelegramUser,
  arg: string,
  reply: ReplyFn,
  chatId: string,
) {
  if (!arg) {
    await reply(chatId, user.digestTime ? `Daily digest at ${user.digestTime}` : "Daily digest is off.");
    return;
  }

  if (arg.toLowerCase() === "off") {
    await ctx.runMutation(internal.telegramBot.updateSettingsFromTelegram, {
      userId: user._id,
      digestTime: "",
    });
    await reply(chatId, "✅ Daily digest disabled.");
    return;
  }

  try {
    await ctx.runMutation(internal.telegramBot.updateSettingsFromTelegram, {
      userId: user._id,
      digestTime: arg,
    });
    await reply(chatId, `✅ Daily digest set to ${arg}`);
  } catch {
    await reply(chatId, "Invalid time. Use HH:MM format (e.g. 08:00).");
  }
}

export async function handleSubtasksCommand(
  ctx: ActionCtx,
  user: TelegramUser,
  num: number,
  reply: ReplyFn,
  chatId: string,
) {
  const tasks = await ctx.runQuery(internal.telegramBot.getTasksForTelegram, { userId: user._id });

  if (isNaN(num) || num < 1 || num > tasks.length) {
    await reply(chatId, `Task #${num} not found. Use /tasks to see your list.`);
    return;
  }

  const target = tasks[num - 1];
  const subtasks = await ctx.runQuery(internal.telegramBot.getSubtasksForTelegram, {
    userId: user._id,
    taskId: target._id,
  });

  if (subtasks.length === 0) {
    await reply(chatId, `"${target.title}" has no subtasks.\nAdd one: /addsub ${num} <title>`);
    return;
  }

  const done = subtasks.filter((s: { isComplete: boolean }) => s.isComplete).length;
  const lines = [`📋 "${target.title}" (${done}/${subtasks.length} done):`];
  subtasks.forEach((s: { isComplete: boolean; title: string }, i: number) => {
    lines.push(`  ${i + 1}. ${s.isComplete ? "✅" : "⬜"} ${s.title}`);
  });
  lines.push(`\nToggle: /donesub ${num}.<subNum>`);
  await reply(chatId, lines.join("\n"));
}

export async function handleAddSubCommand(
  ctx: ActionCtx,
  user: TelegramUser,
  arg: string,
  reply: ReplyFn,
  chatId: string,
) {
  const match = arg.match(/^(\d+)\s+(.+)$/);
  if (!match) {
    await reply(chatId, "Usage: /addsub 3 Order supplies");
    return;
  }

  const taskNum = parseInt(match[1], 10);
  const subTitle = match[2].trim();
  const tasks = await ctx.runQuery(internal.telegramBot.getTasksForTelegram, { userId: user._id });

  if (taskNum < 1 || taskNum > tasks.length) {
    await reply(chatId, `Task #${taskNum} not found. Use /tasks to see your list.`);
    return;
  }

  try {
    const result = await ctx.runMutation(internal.telegramBot.addSubtaskFromTelegram, {
      userId: user._id,
      taskId: tasks[taskNum - 1]._id,
      title: subTitle.slice(0, 200),
    });
    if (result.success) {
      await reply(chatId, `➕ Added subtask to "${tasks[taskNum - 1].title}": ${result.title}`);
    } else {
      await reply(chatId, "Could not add subtask.");
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to add subtask";
    await reply(chatId, msg);
  }
}

export async function handleDoneSubCommand(
  ctx: ActionCtx,
  user: TelegramUser,
  arg: string,
  reply: ReplyFn,
  chatId: string,
) {
  const match = arg.match(/^(\d+)\.(\d+)$/);
  if (!match) {
    await reply(chatId, "Usage: /donesub 3.1 (task #3, subtask #1)");
    return;
  }

  const taskNum = parseInt(match[1], 10);
  const subNum = parseInt(match[2], 10);
  const tasks = await ctx.runQuery(internal.telegramBot.getTasksForTelegram, { userId: user._id });

  if (taskNum < 1 || taskNum > tasks.length) {
    await reply(chatId, `Task #${taskNum} not found. Use /tasks to see your list.`);
    return;
  }

  const subtasks = await ctx.runQuery(internal.telegramBot.getSubtasksForTelegram, {
    userId: user._id,
    taskId: tasks[taskNum - 1]._id,
  });

  if (subNum < 1 || subNum > subtasks.length) {
    await reply(chatId, `Subtask #${subNum} not found. Use /subtasks ${taskNum} to see the list.`);
    return;
  }

  const result = await ctx.runMutation(internal.telegramBot.toggleSubtaskFromTelegram, {
    userId: user._id,
    subtaskId: subtasks[subNum - 1]._id,
  });

  if (result.success) {
    await reply(chatId, `${result.isComplete ? "✅" : "⬜"} ${result.title}`);
  } else {
    await reply(chatId, "Could not toggle subtask.");
  }
}

export async function handleTodayCommand(
  ctx: ActionCtx,
  user: TelegramUser,
  reply: ReplyFn,
  chatId: string,
) {
  const tz = user.timezone ?? DEFAULT_TIMEZONE;
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: tz });

  const tasks = await ctx.runQuery(internal.telegramBot.getTasksForTelegram, { userId: user._id });

  const todayTasks = tasks.filter((t: TaskListItem) => {
    if (!t.dueDate) return false;
    return new Date(t.dueDate).toLocaleDateString("en-CA", { timeZone: tz }) === todayStr;
  });

  const overdue = tasks.filter((t: TaskListItem) => {
    if (!t.dueDate) return false;
    return new Date(t.dueDate).toLocaleDateString("en-CA", { timeZone: tz }) < todayStr;
  });

  const lines: string[] = [];
  if (overdue.length > 0) {
    lines.push(`🔴 Overdue (${overdue.length})`);
    overdue.forEach((t: TaskListItem, i: number) => {
      lines.push(`  ${i + 1}. ${t.priority === "high" ? "[!] " : ""}${t.title}`);
    });
    lines.push("");
  }
  if (todayTasks.length > 0) {
    lines.push(`📅 Today (${todayTasks.length})`);
    todayTasks.forEach((t: TaskListItem, i: number) => {
      const time = t.dueTime ? ` · ${t.dueTime}` : "";
      lines.push(`  ${i + 1}. ${t.priority === "high" ? "[!] " : ""}${t.title}${time}`);
    });
  }

  await reply(chatId, lines.length === 0 ? "Nothing due today. Nice work!" : lines.join("\n"));
}

export async function handleSearchCommand(
  ctx: ActionCtx,
  user: TelegramUser,
  query: string,
  reply: ReplyFn,
  chatId: string,
) {
  const tasks = await ctx.runQuery(internal.telegramBot.getTasksForTelegram, { userId: user._id });
  const lower = query.toLowerCase();
  const matches = tasks.filter((t: TaskListItem) => t.title.toLowerCase().includes(lower));

  if (matches.length === 0) {
    await reply(chatId, `No tasks matching "${query}".`);
    return;
  }

  const lines = [`🔍 Results for "${query}":`];
  matches.forEach((t: TaskListItem, i: number) => {
    const due = t.dueDate
      ? ` · ${new Date(t.dueDate).toLocaleDateString("en-CA", { timeZone: user.timezone ?? DEFAULT_TIMEZONE })}`
      : "";
    lines.push(`  ${i + 1}. ${t.title} [${t.workstream}]${due}`);
  });
  await reply(chatId, lines.join("\n"));
}

export async function handleTemplatesCommand(
  ctx: ActionCtx,
  user: TelegramUser,
  reply: ReplyFn,
  chatId: string,
) {
  const templates = await ctx.runQuery(internal.taskTemplates.getTemplatesForTelegram, {
    userId: user._id,
  });

  if (templates.length === 0) {
    await reply(chatId, "No templates found. Add templates from the web app.");
    return;
  }

  // Group by category
  const byCategory = new Map<string, typeof templates>();
  for (const t of templates) {
    const list = byCategory.get(t.category) ?? [];
    list.push(t);
    byCategory.set(t.category, list);
  }

  let n = 1;
  const lines = ["📋 Templates:"];
  for (const [cat, items] of byCategory) {
    lines.push(`\n${cat}:`);
    for (const tmpl of items) {
      lines.push(`  ${n}. ${tmpl.title} [${tmpl.workstream}]${tmpl.recurring ? ` 🔁` : ""}`);
      n++;
    }
  }
  lines.push("\nUse: /use <number>");
  await reply(chatId, lines.join("\n"));
}

export async function handleUseTemplateCommand(
  ctx: ActionCtx,
  user: TelegramUser,
  arg: string,
  reply: ReplyFn,
  chatId: string,
) {
  const templates = await ctx.runQuery(internal.taskTemplates.getTemplatesForTelegram, {
    userId: user._id,
  });

  if (templates.length === 0) {
    await reply(chatId, "No templates found. Use /templates to see available templates.");
    return;
  }

  const num = parseInt(arg, 10);
  const template =
    !isNaN(num) && num >= 1 && num <= templates.length
      ? templates[num - 1]
      : templates.find((t) => t.title.toLowerCase().includes(arg.toLowerCase()));

  if (!template) {
    await reply(chatId, `Template not found. Use /templates to see available templates.`);
    return;
  }

  const result = await ctx.runMutation(internal.taskTemplates.createFromTemplateForTelegram, {
    templateId: template._id,
    userId: user._id,
  });

  if (result.success) {
    await reply(chatId, formatTaskConfirmation("added", result.title, result.workstream));
  } else {
    await reply(chatId, "Could not create task from template.");
  }
}

export async function handleFreeText(
  ctx: ActionCtx,
  user: TelegramUser,
  text: string,
  reply: ReplyFn,
  chatId: string,
) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const tasks = await ctx.runQuery(internal.telegramBot.getTasksForTelegram, { userId: user._id });

    const aiResult = await ctx.runAction(internal.aiActions.parseTaskIntentInternal, {
      userId: user._id,
      input: text,
      taskContext: buildTaskContext(tasks),
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
        const result = await ctx.runMutation(internal.telegramBot.completeTaskFromTelegram, {
          userId: user._id,
          taskId: target._id as Id<"tasks">,
        });
        if (result.success) {
          const extra = result.wasRecurring ? "\nNext occurrence created." : "";
          await reply(chatId, formatTaskConfirmation("completed", result.title, result.workstream) + extra);
        } else {
          await reply(chatId, "Could not complete that task.");
        }
      } else {
        await reply(chatId, "Could not find the matching task.");
      }
    } else if (aiResult.intent === "edit" && aiResult.taskIndex !== undefined && aiResult.fields) {
      const target = tasks[aiResult.taskIndex];
      if (target) {
        const result = await ctx.runMutation(internal.telegramBot.editTaskFromTelegram, {
          userId: user._id,
          taskId: target._id as Id<"tasks">,
          ...buildEditPatch(aiResult.fields),
        });
        if (result.success) {
          await reply(chatId, formatEditConfirmation(result.title, result.changes));
        } else {
          await reply(chatId, "Could not edit that task.");
        }
      } else {
        await reply(chatId, "Could not find the matching task.");
      }
    } else if (aiResult.intent === "delete" && aiResult.taskIndex !== undefined) {
      const target = tasks[aiResult.taskIndex];
      if (target) {
        const result = await ctx.runMutation(internal.telegramBot.deleteTaskFromTelegram, {
          userId: user._id,
          taskId: target._id as Id<"tasks">,
        });
        if (result.success) {
          await reply(chatId, formatTaskConfirmation("deleted", result.title, result.workstream));
        } else {
          await reply(chatId, "Could not delete that task.");
        }
      } else {
        await reply(chatId, "Could not find the matching task.");
      }
    } else {
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
}
