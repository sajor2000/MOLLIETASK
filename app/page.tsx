"use client";

import { useMemo, useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AppShell } from "@/components/layout/AppShell";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { TaskOverlays } from "@/components/task/TaskOverlays";
import type { Doc } from "@/convex/_generated/dataModel";
import type { TaskFormData } from "@/lib/constants";
import { useTaskActions } from "@/hooks/useTaskActions";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useWorkstreamFilter } from "@/hooks/useWorkstreamFilter";
import { WorkstreamFilter } from "@/components/ui/WorkstreamFilter";

const AiCaptureBar = dynamic(
  () => import("@/components/task/AiCaptureBar").then((m) => ({ default: m.AiCaptureBar })),
  { ssr: false },
);
const TemplateLibrary = dynamic(
  () => import("@/components/task/TemplateLibrary").then((m) => ({ default: m.TemplateLibrary })),
  { ssr: false },
);

export default function KanbanPage() {
  const { isOwner, isMember } = useWorkspace();
  const tasks = useQuery(api.tasks.getTasksByStatus, {});
  const staffList = useQuery(api.staff.listStaff, isOwner ? {} : "skip");
  const {
    editingTask,
    setEditingTask,
    isCreating,
    setIsCreating,
    handleSave,
    handleDelete,
    handleComplete,
    handleReorder,
    handleClearCompleted,
    handleUndo,
    undoAction,
    clearUndo,
    errorMessage,
    clearError,
  } = useTaskActions(tasks);

  // Kanban-specific state
  const [prefillData, setPrefillData] = useState<Partial<TaskFormData> | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);
  const { workstreamFilter, setWorkstreamFilter } = useWorkstreamFilter();

  const filteredTasks = useMemo(() => {
    if (!tasks) return tasks;
    const hasSearch = searchQuery.trim().length > 0;
    if (!hasSearch && !workstreamFilter) return tasks;
    const q = hasSearch ? searchQuery.toLowerCase() : "";
    return tasks.filter((t) => {
      if (hasSearch && !t.title.toLowerCase().includes(q)) return false;
      if (workstreamFilter && t.workstream !== workstreamFilter) return false;
      return true;
    });
  }, [tasks, searchQuery, workstreamFilter]);

  const staffKey = staffList?.map((s) => s._id).join(",") ?? "";
  const staffById = useMemo(() => {
    const m = new Map<string, Doc<"staffMembers">>();
    for (const s of staffList ?? []) m.set(s._id, s);
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffKey]);

  const handleAiAddTask = (prefill: Partial<TaskFormData>) => {
    setPrefillData(prefill);
    setIsCreating(true);
  };

  const handleAiEditTask = (task: Doc<"tasks">, changes: Partial<TaskFormData>) => {
    setEditingTask(task);
    setPrefillData(changes);
  };

  const handleCloseModal = () => {
    setEditingTask(null);
    setIsCreating(false);
    setPrefillData(undefined);
  };

  // Keyboard shortcut: press N to open new task (owner only, not while typing)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isMember) return;
      if (e.key !== "n" && e.key !== "N") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable) return;
      if (isCreating || editingTask) return;
      e.preventDefault();
      setIsCreating(true);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isMember, isCreating, editingTask, setIsCreating]);

  if (tasks === undefined) {
    return (
      <AppShell onAddTask={isMember ? undefined : () => setIsCreating(true)}>
        {/* Mobile skeleton: single column */}
        <div className="md:hidden px-3 py-4">
          <div className="flex gap-1 bg-bg-base rounded-[4px] p-1 mx-1 mb-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex-1 h-8 bg-surface rounded-[4px] animate-pulse" />
            ))}
          </div>
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-[72px] bg-surface rounded-[4px] mb-2 animate-pulse" />
          ))}
        </div>
        {/* Desktop skeleton: 3 columns */}
        <div className="hidden md:flex gap-0 h-full">
          {["todo", "inprogress", "done"].map((col) => (
            <div key={col} className="flex-1 min-w-[280px] px-3 py-4">
              <div className="h-4 w-20 bg-surface rounded animate-pulse mb-4" />
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-[72px] bg-surface rounded-[4px] mb-2 animate-pulse" />
              ))}
            </div>
          ))}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      onAddTask={isMember ? undefined : () => setIsCreating(true)}
      onOpenTemplates={isMember ? undefined : () => setShowTemplates(true)}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      topBarExtra={
        !isMember ? (
          <AiCaptureBar
            tasks={tasks}
            staffMembers={staffList ?? []}
            onAddTask={handleAiAddTask}
            onEditTask={handleAiEditTask}
            onCompleteTask={handleComplete}
            onDeleteTask={handleDelete}
          />
        ) : undefined
      }
    >
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        {/* Mobile-only AI capture bar (desktop version lives in the top bar) */}
        {!isMember && (
          <div className="md:hidden shrink-0 px-4 py-2 border-b border-border/50">
            <AiCaptureBar
              tasks={tasks}
              staffMembers={staffList ?? []}
              onAddTask={handleAiAddTask}
              onEditTask={handleAiEditTask}
              onCompleteTask={handleComplete}
              onDeleteTask={handleDelete}
              fullWidth
            />
          </div>
        )}
        {/* Workstream filter chips */}
        <div className="shrink-0 border-b border-border/30">
          <WorkstreamFilter value={workstreamFilter} onChange={setWorkstreamFilter} className="px-4 py-2" />
        </div>
        <div className="flex-1 min-h-0">
          <KanbanBoard
            tasks={filteredTasks ?? []}
            staffById={staffById}
            onMoveTask={isMember ? undefined : handleReorder}
            onEditTask={setEditingTask}
            onCompleteTask={handleComplete}
            onClearCompleted={isMember ? undefined : handleClearCompleted}
          />
        </div>
      </div>

      <TaskOverlays
        editingTask={editingTask}
        isCreating={isCreating}
        prefill={isCreating ? prefillData : undefined}
        staffMembers={staffList ?? []}
        isMember={isMember}
        onSave={handleSave}
        onDelete={handleDelete}
        onClose={handleCloseModal}
        undoAction={undoAction}
        onUndo={handleUndo}
        onUndoExpire={clearUndo}
        errorMessage={errorMessage}
        onErrorDismiss={clearError}
      />

      {showTemplates && !isMember && (
        <TemplateLibrary
          onClose={() => setShowTemplates(false)}
          onEditTask={(task) => {
            setShowTemplates(false);
            setEditingTask(task);
          }}
        />
      )}
    </AppShell>
  );
}
