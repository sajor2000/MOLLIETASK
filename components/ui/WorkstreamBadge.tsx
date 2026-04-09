import { memo } from "react";
import { Workstream, WORKSTREAM_CONFIG } from "@/lib/constants";

interface WorkstreamBadgeProps {
  workstream: Workstream;
}

export const WorkstreamBadge = memo(function WorkstreamBadge({ workstream }: WorkstreamBadgeProps) {
  const config = WORKSTREAM_CONFIG[workstream];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${config.bgClass} ${config.textClass}`}
    >
      {config.label}
    </span>
  );
});
