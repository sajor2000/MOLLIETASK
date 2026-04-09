import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

// ── Shared validators (reusable across schema + functions) ───
export const workstreamValidator = v.union(
  v.literal("practice"),
  v.literal("personal"),
  v.literal("family"),
);

export const priorityValidator = v.union(
  v.literal("high"),
  v.literal("normal"),
);

export const statusValidator = v.union(
  v.literal("todo"),
  v.literal("inprogress"),
  v.literal("done"),
);

export const recurringValidator = v.union(
  v.literal("daily"),
  v.literal("weekdays"),
  v.literal("weekly"),
  v.literal("monthly"),
);

export default defineSchema({
  ...authTables,

  // Extend the authTables users table with app-specific fields
  users: defineTable({
    // Fields from Convex Auth (must be included)
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    // App-specific fields
    createdAt: v.optional(v.number()),
    // Legacy fields — kept for backward compatibility with existing data
    passwordHash: v.optional(v.string()),
    sessionToken: v.optional(v.string()),
    timezone: v.optional(v.string()),
    digestTime: v.optional(v.string()),
    telegramChatId: v.optional(v.string()),
    telegramLinkToken: v.optional(v.string()),
    telegramLinkExpiry: v.optional(v.number()),
    lastUsedWorkstream: v.optional(workstreamValidator),
    lastDigestSentAt: v.optional(v.number()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_telegramChatId", ["telegramChatId"]),

  tasks: defineTable({
    userId: v.id("users"),
    title: v.string(),
    workstream: workstreamValidator,
    priority: priorityValidator,
    status: statusValidator,
    dueDate: v.optional(v.number()),
    dueTime: v.optional(v.string()),
    recurring: v.optional(recurringValidator),
    notes: v.optional(v.string()),
    sortOrder: v.number(),
    reminderAt: v.optional(v.number()),
    reminderSent: v.optional(v.boolean()),
    scheduledReminderId: v.optional(v.id("_scheduled_functions")),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_userId_status_dueDate", ["userId", "status", "dueDate"])
    .index("by_userId_status_sortOrder", ["userId", "status", "sortOrder"]),

  pushSubscriptions: defineTable({
    userId: v.id("users"),
    endpoint: v.string(),
    keys: v.object({
      p256dh: v.string(),
      auth: v.string(),
    }),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_endpoint", ["userId", "endpoint"]),
});
