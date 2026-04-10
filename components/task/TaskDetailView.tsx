"use client";

import { useEffect, useRef, useState, useCallback, useId } from "react";
import { TaskForm } from "./TaskForm";
import { SubtaskList } from "./SubtaskList";
import { Icon } from "@/components/ui/Icon";
import type { Doc } from "@/convex/_generated/dataModel";
import type { TaskFormData } from "@/lib/constants";

interface TaskDetailViewProps {
  task?: Doc<"tasks"> | null;
  prefill?: Partial<TaskFormData>;
  staffMembers?: Doc<"staffMembers">[];
  onSave: (data: TaskFormData) => void | Promise<void>;
  onDelete?: () => void;
  onClose: () => void;
}

export function TaskDetailView({
  task,
  prefill,
  staffMembers,
  onSave,
  onDelete,
  onClose,
}: TaskDetailViewProps) {
  const [dialogEl, setDialogEl] = useState<HTMLDivElement | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const headingId = useId();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const baseViewportHeightRef = useRef(0);
  const dialogRef = useCallback((node: HTMLDivElement | null) => {
    setDialogEl(node);
  }, []);

  const requestClose = useCallback(() => {
    if (!isDirty || window.confirm("Discard your unsaved changes?")) {
      onClose();
    }
  }, [isDirty, onClose]);

  // Use ref to avoid re-attaching listener when onClose changes
  const onCloseRef = useRef(requestClose);
  useEffect(() => {
    onCloseRef.current = requestClose;
  }, [requestClose]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseRef.current();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Focus trap — keep Tab/Shift+Tab inside the dialog
  useEffect(() => {
    if (!dialogEl) return;
    const selector =
      'a[href], button:not([disabled]), textarea, input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

    function handleTab(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const focusable = dialogEl!.querySelectorAll<HTMLElement>(selector);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    dialogEl.addEventListener("keydown", handleTab);
    return () => dialogEl.removeEventListener("keydown", handleTab);
  }, [dialogEl]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    lastFocusedRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
      lastFocusedRef.current?.focus();
    };
  }, []);

  // Move focus into the dialog when it opens.
  useEffect(() => {
    if (!dialogEl) return;
    const frame = requestAnimationFrame(() => {
      const autoFocusTarget = dialogEl.querySelector<HTMLElement>("[data-task-title-input='true']");
      (autoFocusTarget ?? closeButtonRef.current)?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [dialogEl]);

  // Keep action bar visible when on-screen keyboard opens.
  useEffect(() => {
    if (!dialogEl) return;

    const updateKeyboardOffset = (height: number, offsetTop = 0) => {
      if (height > baseViewportHeightRef.current) baseViewportHeightRef.current = height;
      const offset = Math.max(0, baseViewportHeightRef.current - height - offsetTop);
      dialogEl.style.setProperty("--keyboard-offset", `${offset}px`);
    };

    baseViewportHeightRef.current = Math.max(baseViewportHeightRef.current, window.innerHeight);

    const viewport = window.visualViewport;
    if (viewport) {
      const syncVisualViewport = () => updateKeyboardOffset(viewport.height, viewport.offsetTop);
      syncVisualViewport();
      viewport.addEventListener("resize", syncVisualViewport);
      viewport.addEventListener("scroll", syncVisualViewport);
      return () => {
        viewport.removeEventListener("resize", syncVisualViewport);
        viewport.removeEventListener("scroll", syncVisualViewport);
        dialogEl.style.removeProperty("--keyboard-offset");
      };
    }

    const syncWindowViewport = () => updateKeyboardOffset(window.innerHeight);
    syncWindowViewport();
    window.addEventListener("resize", syncWindowViewport);
    return () => {
      window.removeEventListener("resize", syncWindowViewport);
      dialogEl.style.removeProperty("--keyboard-offset");
    };
  }, [dialogEl]);

  // Keep focused inputs visible when keyboards shrink the viewport.
  useEffect(() => {
    if (!dialogEl) return;
    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName)) return;
      window.setTimeout(() => {
        target.scrollIntoView({ block: "nearest", inline: "nearest" });
      }, 120);
    };

    dialogEl.addEventListener("focusin", handleFocusIn);
    return () => dialogEl.removeEventListener("focusin", handleFocusIn);
  }, [dialogEl]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60] bg-bg-base/60 backdrop-blur-sm"
        onClick={requestClose}
      />

      {/* Responsive container: bottom sheet on mobile, centered modal on desktop */}
      <div className="fixed inset-0 z-[70] pointer-events-none flex items-end md:items-center justify-center md:p-6">
        <div
          ref={dialogRef}
          className="pointer-events-auto bg-surface-elevated border-t border-x md:border border-border rounded-t-[8px] md:rounded-[4px] w-full md:max-w-[480px] max-h-[85dvh] md:max-h-[80vh] flex flex-col min-h-0 overflow-hidden animate-[slideUp_200ms_ease-out] md:animate-[fadeIn_150ms_ease-out]"
          role="dialog"
          aria-modal="true"
          aria-labelledby={headingId}
        >
          {/* Drag handle — mobile only */}
          <div className="flex justify-center py-3 md:hidden" aria-hidden="true">
            <div className="w-10 h-1 bg-border rounded-full" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-6 pb-2 md:py-4 md:border-b md:border-border">
            <h2 id={headingId} className="text-[15px] font-medium text-text-primary">
              {task ? "Edit task" : "New task"}
            </h2>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={requestClose}
              aria-label="Close task editor"
              className="text-text-muted hover:text-text-secondary transition-colors duration-200"
            >
              <Icon name="close" className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 min-h-0">
            <TaskForm
              key={task?._id ?? "new"}
              task={task}
              prefill={prefill}
              staffMembers={staffMembers}
              hotkeyRoot={dialogEl}
              onSave={onSave}
              onDelete={onDelete}
              onClose={requestClose}
              onDirtyChange={setIsDirty}
              autoFocusTitle={!task}
            >
              {task?._id && <SubtaskList parentTaskId={task._id} />}
            </TaskForm>
          </div>
        </div>
      </div>
    </>
  );
}
