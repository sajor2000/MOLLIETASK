import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Check for overdue tasks every hour
crons.interval(
  "overdue check",
  { hours: 1 },
  internal.reminders.checkOverdue,
);

// Check if it's time to send daily digest every 15 minutes
crons.interval(
  "digest check",
  { minutes: 15 },
  internal.reminders.checkDigest,
);

export default crons;
