"use client";

import { memo } from "react";
import { COLUMN_ORDER, STATUS_CONFIG, type TaskStatus } from "@/lib/constants";

interface MobileStatusTabsProps {
  activeStatus: TaskStatus;
  onStatusChange: (status: TaskStatus) => void;
  taskCounts: Record<TaskStatus, number>;
}

export const MobileStatusTabs = memo(function MobileStatusTabs({
  activeStatus,
  onStatusChange,
  taskCounts,
}: MobileStatusTabsProps) {
  return (
    <div className="flex gap-1 bg-bg-base rounded-[4px] p-1 mx-4 my-2">
      {COLUMN_ORDER.map((status) => (
        <button
          key={status}
          type="button"
          onClick={() => onStatusChange(status)}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[12px] rounded-[4px] transition-all duration-200 ${
            activeStatus === status
              ? "bg-surface text-accent font-medium"
              : "text-text-muted"
          }`}
        >
          {STATUS_CONFIG[status].label}
          <span
            className={`text-[10px] ${
              activeStatus === status ? "text-accent/60" : "text-text-muted/60"
            }`}
          >
            {taskCounts[status]}
          </span>
        </button>
      ))}
    </div>
  );
});
