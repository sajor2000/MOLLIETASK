import { DEFAULT_TIMEZONE } from "./constants";

// Hoisted Intl.DateTimeFormat instances — created once at module level
const CST_DATE_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: DEFAULT_TIMEZONE,
});
const CST_WEEKDAY_FMT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  timeZone: DEFAULT_TIMEZONE,
});
const CST_MONTHDAY_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: DEFAULT_TIMEZONE,
});
const DATE_PARTS_FMT_CACHE = new Map<string, Intl.DateTimeFormat>();

function getDatePartsFmt(tz: string): Intl.DateTimeFormat {
  let fmt = DATE_PARTS_FMT_CACHE.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    });
    DATE_PARTS_FMT_CACHE.set(tz, fmt);
  }
  return fmt;
}

/** Get YYYY-MM-DD in CST for a given timestamp */
export function toCSTDateString(ts: number): string {
  return CST_DATE_FMT.format(new Date(ts));
}

/** Alias for toCSTDateString — used by form inputs expecting YYYY-MM-DD */
export const toDateInputValue = toCSTDateString;

/** Parse a YYYY-MM-DD string to a UTC timestamp representing midnight in CST */
export function fromDateInputValue(dateStr: string): number {
  const noon = new Date(dateStr + "T12:00:00Z");
  const utcParts = dateParts(noon, "UTC");
  const cstParts = dateParts(noon, DEFAULT_TIMEZONE);
  const utcMins = utcParts.hour * 60 + utcParts.minute;
  const cstMins = cstParts.hour * 60 + cstParts.minute;
  let offsetMins = utcMins - cstMins;
  if (utcParts.day !== cstParts.day)
    offsetMins += (utcParts.day > cstParts.day ? 1 : -1) * 1440;
  return new Date(dateStr + "T00:00:00Z").getTime() + offsetMins * 60_000;
}

function dateParts(d: Date, tz: string) {
  const p = getDatePartsFmt(tz).formatToParts(d);
  const get = (t: string) =>
    parseInt(p.find((x) => x.type === t)?.value ?? "0");
  return { day: get("day"), hour: get("hour"), minute: get("minute") };
}

/** Format a due date timestamp for display in a task card */
export function formatDueDate(timestamp?: number): string | null {
  if (!timestamp) return null;
  const taskDateStr = toCSTDateString(timestamp);
  const todayStr = toCSTDateString(Date.now());

  const taskDays = Date.parse(taskDateStr);
  const todayDays = Date.parse(todayStr);
  const diffDays = Math.round((taskDays - todayDays) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays < 7) return CST_WEEKDAY_FMT.format(new Date(timestamp));
  return CST_MONTHDAY_FMT.format(new Date(timestamp));
}

/** Check if a task is overdue using CST date comparison (not raw UTC) */
export function isTaskOverdue(
  dueDate: number | undefined,
  status: string,
): boolean {
  if (!dueDate || status === "done") return false;
  const taskDateStr = toCSTDateString(dueDate);
  const todayStr = toCSTDateString(Date.now());
  return taskDateStr < todayStr;
}
