"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Icon } from "@/components/ui/Icon";

function formatBytes(n: number | undefined): string {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

interface TaskAttachmentsProps {
  taskId: Id<"tasks">;
}

export function TaskAttachments({ taskId }: TaskAttachmentsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const attachments = useQuery(api.taskAttachments.listForTask, { taskId });
  const generateUploadUrl = useMutation(api.taskAttachments.generateUploadUrl);
  const finalizeUpload = useMutation(api.taskAttachments.finalizeUpload);
  const removeAttachment = useMutation(api.taskAttachments.removeAttachment);

  async function handleFilesSelected(files: FileList | null) {
    if (!files?.length) return;
    setUploadError(null);
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const postUrl = await generateUploadUrl({});
        const uploadContentType = file.type || "application/octet-stream";
        const res = await fetch(postUrl, {
          method: "POST",
          headers: { "Content-Type": uploadContentType },
          body: file,
        });
        if (!res.ok) {
          throw new Error(`Upload failed (${res.status})`);
        }
        const json = (await res.json()) as { storageId?: string };
        if (!json.storageId) {
          throw new Error("Upload response missing storageId");
        }
        await finalizeUpload({
          taskId,
          storageId: json.storageId as Id<"_storage">,
          filename: file.name,
        });
      }
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <label className="text-[11px] font-medium text-text-secondary uppercase tracking-widest block mb-2">
        Attachments
      </label>

      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleFilesSelected(e.target.files)}
      />

      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="w-full flex items-center justify-center gap-2 py-2 px-3 text-[13px] text-text-secondary bg-bg-base border border-border/15 border-dashed rounded-[4px] hover:border-accent/40 hover:text-text-primary disabled:opacity-50 transition-colors duration-200"
      >
        <Icon name="add" className="w-4 h-4" />
        {uploading ? "Uploading…" : "Add file"}
      </button>

      {uploadError && (
        <p className="mt-2 text-[12px] text-destructive" role="alert">
          {uploadError}
        </p>
      )}

      {attachments && attachments.length > 0 && (
        <ul className="mt-3 space-y-2">
          {attachments.map((a) => (
            <li
              key={a._id}
              className="flex items-center gap-2 text-[13px] bg-bg-base border border-border/15 rounded-[4px] px-3 py-2"
            >
              <span className="flex-1 min-w-0 truncate text-text-primary" title={a.filename ?? "File"}>
                {a.filename ?? "File"}
                {a.size != null ? (
                  <span className="text-text-muted font-normal"> · {formatBytes(a.size)}</span>
                ) : null}
              </span>
              {a.url ? (
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-accent hover:underline"
                >
                  Open
                </a>
              ) : (
                <span className="shrink-0 text-text-muted text-[12px]">Unavailable</span>
              )}
              <button
                type="button"
                onClick={() =>
                  removeAttachment({ attachmentId: a._id }).catch(() => {
                    console.error("Failed to remove attachment");
                  })
                }
                className="shrink-0 p-1 text-text-muted hover:text-destructive transition-colors"
                aria-label="Remove attachment"
              >
                <Icon name="close" className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
