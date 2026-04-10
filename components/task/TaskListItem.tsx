import type { Doc, Id } from "@/convex/_generated/dataModel";
import { WORKSTREAM_CONFIG } from "@/lib/constants";

export function TaskListItem({
  task,
  onComplete,
  onEdit,
}: {
  task: Doc<"tasks">;
  onComplete: (taskId: Id<"tasks">) => void;
  onEdit: (task: Doc<"tasks">) => void;
}) {
  const wsConfig = WORKSTREAM_CONFIG[task.workstream];

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-[4px] bg-surface hover:bg-surface-elevated transition-colors duration-200 group">
      <button
        onClick={() => onComplete(task._id)}
        className="flex-shrink-0 w-5 h-5 rounded-full border-2 border-border hover:border-accent transition-colors duration-200"
        aria-label="Complete task"
      />
      <button onClick={() => onEdit(task)} className="flex-1 min-w-0 text-left">
        <p className="text-[13px] text-text-primary truncate">{task.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-[11px] ${wsConfig.textClass}`}>
            {wsConfig.label}
          </span>
          {task.priority === "high" && (
            <span className="text-[11px] text-destructive">High</span>
          )}
          {task.recurring && (
            <span className="text-[11px] text-text-muted">
              {task.recurring === "daily" ? "Daily" : task.recurring === "weekdays" ? "Weekdays" : task.recurring === "weekly" ? "Weekly" : "Monthly"}
            </span>
          )}
          {task.dueTime && (
            <span className="text-[11px] text-text-muted">{task.dueTime}</span>
          )}
        </div>
      </button>
    </div>
  );
}
