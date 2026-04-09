"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("AI timed out")), ms),
    ),
  ]);
}

interface SuggestStepsButtonProps {
  parentTaskId: Id<"tasks">;
  hasSubtasks: boolean;
}

export function SuggestStepsButton({
  parentTaskId,
  hasSubtasks,
}: SuggestStepsButtonProps) {
  const suggestSubtasks = useAction(api.aiActions.suggestSubtasks);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setIsLoading(true);
    setError(null);
    try {
      await withTimeout(suggestSubtasks({ taskId: parentTaskId }), 15000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to suggest steps");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={isLoading}
        className="text-[12px] text-text-muted hover:text-accent disabled:opacity-50 transition-colors duration-200"
      >
        {isLoading ? (
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 border border-text-muted/30 border-t-accent rounded-full animate-spin" />
            Thinking...
          </span>
        ) : hasSubtasks ? (
          "Suggest more steps"
        ) : (
          "Suggest steps"
        )}
      </button>
      {error && (
        <p className="text-[11px] text-destructive mt-1">{error}</p>
      )}
    </div>
  );
}
