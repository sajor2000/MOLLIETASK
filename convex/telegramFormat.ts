// Pure formatting helpers for Telegram messages — no Convex decorators.

const DEFAULT_TZ = "America/Chicago";

type TaskForDisplay = {
  _id: string;
  title: string;
  workstream: "practice" | "personal" | "family";
  priority: "high" | "normal";
  status: "todo" | "inprogress" | "done";
  dueDate?: number;
  dueTime?: string;
};

const WORKSTREAM_EMOJI: Record<string, string> = {
  practice: "\u{1F3E5}",
  personal: "\u{1F464}",
  family: "\u{1F46A}",
};

export function formatTaskList(tasks: TaskForDisplay[]): string {
  if (tasks.length === 0) return "No open tasks. Nice work!";

  const groups = new Map<string, TaskForDisplay[]>();
  for (const t of tasks) {
    const list = groups.get(t.workstream) ?? [];
    list.push(t);
    groups.set(t.workstream, list);
  }

  const lines: string[] = [];
  let globalIndex = 1;

  for (const [ws, items] of groups) {
    const emoji = WORKSTREAM_EMOJI[ws] ?? "";
    const label = ws.charAt(0).toUpperCase() + ws.slice(1);
    lines.push(`${emoji} ${label} (${items.length})`);

    for (const t of items) {
      const pri = t.priority === "high" ? "[!] " : "";
      const due = formatDue(t.dueDate, t.dueTime);
      lines.push(`  ${globalIndex}. ${pri}${t.title}${due}`);
      globalIndex++;
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

function formatDue(dueDate?: number, dueTime?: string): string {
  if (!dueDate) return "";
  const d = new Date(dueDate);
  const month = d.toLocaleString("en-US", { month: "short", timeZone: DEFAULT_TZ });
  const day = d.toLocaleString("en-US", { day: "numeric", timeZone: DEFAULT_TZ });
  const time = dueTime ? ` ${dueTime}` : "";
  return ` \u00b7 ${month} ${day}${time}`;
}

export function formatTaskConfirmation(
  action: "added" | "completed" | "deleted",
  title: string,
  workstream: string,
): string {
  const emoji = action === "completed" ? "\u2705" : action === "added" ? "\u2795" : "\u274c";
  return `${emoji} ${action.charAt(0).toUpperCase() + action.slice(1)}: ${title} (${workstream})`;
}

export function formatSnoozeConfirmation(title: string, newReminderAt: number): string {
  const d = new Date(newReminderAt);
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: DEFAULT_TZ,
  });
  return `\u23f0 Snoozed: ${title} \u2014 reminder at ${time}`;
}

export function formatEditConfirmation(title: string, changes: string[]): string {
  const changeSummary = changes.length > 0 ? changes.join(", ") : "no changes";
  return `\u270f\ufe0f Updated: ${title} (${changeSummary})`;
}

export const HELP_TEXT = `Available commands:
/add Buy supplies @practice !high \u2014 Add a task
/tasks \u2014 List your current tasks
/done 3 \u2014 Complete task #3 from list
/done Buy supplies \u2014 Complete task by name
/edit 3 change priority to high \u2014 Edit task #3
/timezone \u2014 Show current timezone
/timezone Central \u2014 Set timezone
/digest 08:00 \u2014 Set daily digest time
/digest off \u2014 Disable daily digest
/help \u2014 Show this help

You can also type naturally:
"Call insurance company tomorrow" \u2014 AI adds task with due date
"Mark buy supplies done" \u2014 AI completes matching task`;
