import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Check for overdue tasks every hour
crons.interval(
  "overdue check",
  { hours: 1 },
  internal.reminders.checkOverdue,
  {},
);

// Check if it's time to send daily digest every 15 minutes
crons.interval(
  "digest check",
  { minutes: 15 },
  internal.reminders.checkDigest,
  {},
);

// Clean up old rate limit entries every 6 hours
crons.interval(
  "rate limit cleanup",
  { hours: 6 },
  internal.rateLimit.cleanupOldEntries,
);

export default crons;
