import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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
  users: defineTable({
    tokenIdentifier: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    image: v.optional(v.string()),
    // App-specific fields
    createdAt: v.optional(v.number()),
    timezone: v.optional(v.string()),
    digestTime: v.optional(v.string()),
    telegramChatId: v.optional(v.string()),
    telegramLinkToken: v.optional(v.string()),
    telegramLinkExpiry: v.optional(v.number()),
    lastUsedWorkstream: v.optional(workstreamValidator),
    lastDigestSentAt: v.optional(v.number()),
  })
    .index("by_tokenIdentifier", ["tokenIdentifier"])
    .index("email", ["email"])
    .index("by_telegramChatId", ["telegramChatId"])
    .index("by_telegramLinkToken", ["telegramLinkToken"]),

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
    subtaskTotal: v.optional(v.number()),
    subtaskCompleted: v.optional(v.number()),
    /** Practice staff row owned by userId; optional delegation label until staff login exists. */
    assignedStaffId: v.optional(v.id("staffMembers")),
  })
    .index("by_userId_status_dueDate", ["userId", "status", "dueDate"])
    .index("by_userId_status_sortOrder", ["userId", "status", "sortOrder"])
    .index("by_userId_assignedStaffId", ["userId", "assignedStaffId"]),

  /** Owner-managed roster; linkedUserId reserved for future staff Google sign-in. */
  staffMembers: defineTable({
    ownerUserId: v.id("users"),
    name: v.string(),
    roleTitle: v.string(),
    /** Optional Meet-the-Team style bio (not shown on Kanban chips). */
    bio: v.optional(v.string()),
    sortOrder: v.number(),
    linkedUserId: v.optional(v.id("users")),
    createdAt: v.number(),
  })
    .index("by_ownerUserId", ["ownerUserId"])
    .index("by_ownerUserId_and_sortOrder", ["ownerUserId", "sortOrder"]),

  subtasks: defineTable({
    parentTaskId: v.id("tasks"),
    userId: v.id("users"),
    title: v.string(),
    isComplete: v.boolean(),
    sortOrder: v.number(),
    createdAt: v.number(),
  })
    .index("by_parentTaskId_and_sortOrder", ["parentTaskId", "sortOrder"]),

  taskAttachments: defineTable({
    taskId: v.id("tasks"),
    userId: v.id("users"),
    storageId: v.id("_storage"),
    filename: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_taskId", ["taskId"])
    .index("by_userId", ["userId"]),

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

  rateLimits: defineTable({
    userId: v.id("users"),
    action: v.string(),
    timestamp: v.number(),
  })
    .index("by_userId_action", ["userId", "action", "timestamp"]),

  taskTemplates: defineTable({
    userId: v.id("users"),
    category: v.string(),
    title: v.string(),
    workstream: workstreamValidator,
    priority: priorityValidator,
    recurring: v.optional(recurringValidator),
    notes: v.optional(v.string()),
    subtasks: v.optional(v.array(v.string())),
    sortOrder: v.number(),
    createdAt: v.number(),
  })
    .index("by_userId_category", ["userId", "category"])
    .index("by_userId_category_sortOrder", ["userId", "category", "sortOrder"]),
});
