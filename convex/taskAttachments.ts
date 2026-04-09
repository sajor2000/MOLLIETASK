import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { getAuthUserId } from "./authHelpers";

/** Max attachments per task (enforced in finalizeUpload). */
export const MAX_FILES_PER_TASK = 10;
/** Max display name length for uploaded files. */
export const MAX_FILENAME_LENGTH = 255;
/** Reject files larger than this after upload (bytes). Convex has deployment limits; keep conservative. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

type StorageMeta = {
  _id: Id<"_storage">;
  _creationTime: number;
  contentType?: string;
  sha256: string;
  size: number;
};

const taskAttachmentListItemValidator = v.object({
  _id: v.id("taskAttachments"),
  _creationTime: v.number(),
  taskId: v.id("tasks"),
  userId: v.id("users"),
  storageId: v.id("_storage"),
  filename: v.optional(v.string()),
  createdAt: v.number(),
  url: v.union(v.string(), v.null()),
  contentType: v.optional(v.string()),
  size: v.optional(v.number()),
});

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await getAuthUserId(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const finalizeUpload = mutation({
  args: {
    taskId: v.id("tasks"),
    storageId: v.id("_storage"),
    filename: v.optional(v.string()),
  },
  returns: v.id("taskAttachments"),
  handler: async (ctx, { taskId, storageId, filename }) => {
    const userId = await getAuthUserId(ctx);

    const task = await ctx.db.get(taskId);
    if (!task || task.userId !== userId) {
      await ctx.storage.delete(storageId);
      throw new Error("Task not found");
    }

    const meta = (await ctx.db.system.get(
      "_storage",
      storageId,
    )) as StorageMeta | null;
    if (!meta) {
      throw new Error("Upload not found");
    }

    if (meta.size > MAX_FILE_BYTES) {
      await ctx.storage.delete(storageId);
      throw new Error(`File too large (max ${MAX_FILE_BYTES} bytes)`);
    }

    if (filename !== undefined) {
      if (filename.length > MAX_FILENAME_LENGTH) {
        await ctx.storage.delete(storageId);
        throw new Error(`Filename max ${MAX_FILENAME_LENGTH} characters`);
      }
    }

    const existing = await ctx.db
      .query("taskAttachments")
      .withIndex("by_taskId", (q) => q.eq("taskId", taskId))
      .take(MAX_FILES_PER_TASK + 1);

    if (existing.length >= MAX_FILES_PER_TASK) {
      await ctx.storage.delete(storageId);
      throw new Error(`Maximum ${MAX_FILES_PER_TASK} files per task`);
    }

    return await ctx.db.insert("taskAttachments", {
      taskId,
      userId,
      storageId,
      filename: filename?.trim() || undefined,
      createdAt: Date.now(),
    });
  },
});

export const removeAttachment = mutation({
  args: { attachmentId: v.id("taskAttachments") },
  returns: v.null(),
  handler: async (ctx, { attachmentId }) => {
    const userId = await getAuthUserId(ctx);

    const row = await ctx.db.get(attachmentId);
    if (!row || row.userId !== userId) {
      throw new Error("Attachment not found");
    }

    await ctx.storage.delete(row.storageId);
    await ctx.db.delete(attachmentId);
    return null;
  },
});

export const listForTask = query({
  args: { taskId: v.id("tasks") },
  returns: v.array(taskAttachmentListItemValidator),
  handler: async (ctx, { taskId }) => {
    const userId = await getAuthUserId(ctx);

    const task = await ctx.db.get(taskId);
    if (!task || task.userId !== userId) {
      return [];
    }

    const rows = await ctx.db
      .query("taskAttachments")
      .withIndex("by_taskId", (q) => q.eq("taskId", taskId))
      .take(50);

    rows.sort((a, b) => a.createdAt - b.createdAt);

    const enriched = await Promise.all(
      rows.map(async (row) => {
        const [meta, url] = await Promise.all([
          ctx.db.system.get(row.storageId) as Promise<StorageMeta | null>,
          ctx.storage.getUrl(row.storageId),
        ]);
        return {
          _id: row._id,
          _creationTime: row._creationTime,
          taskId: row.taskId,
          userId: row.userId,
          storageId: row.storageId,
          filename: row.filename,
          createdAt: row.createdAt,
          url,
          contentType: meta?.contentType,
          size: meta?.size,
        };
      }),
    );

    return enriched;
  },
});
