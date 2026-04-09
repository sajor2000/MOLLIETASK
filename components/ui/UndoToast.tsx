"use client";

import { useEffect, useRef } from "react";
import { Icon } from "@/components/ui/Icon";

interface UndoToastProps {
  message: string;
  onUndo: () => void;
  onExpire: () => void;
  duration?: number;
}

export function UndoToast({
  message,
  onUndo,
  onExpire,
  duration = 5000,
}: UndoToastProps) {
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    const timer = setTimeout(() => onExpireRef.current(), duration);
    return () => clearTimeout(timer);
  }, [duration]);

  return (
    <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 animate-[slideUp_200ms_ease-out]">
      <div className="flex items-center gap-3 bg-surface-elevated border border-border rounded-[4px] px-4 py-3 min-w-[280px]">
        <Icon name="check_circle" className="w-[18px] h-[18px] text-success" />
        <span className="flex-1 text-[13px] text-text-primary">{message}</span>
        <button
          onClick={onUndo}
          className="text-[13px] font-medium text-accent hover:text-accent-light transition-colors duration-200"
        >
          Undo
        </button>
      </div>
      {/* Progress bar — pure CSS animation, no JS interval */}
      <div className="h-[2px] bg-border rounded-b-[4px] overflow-hidden mt-[-1px] mx-[1px]">
        <div
          className="h-full bg-accent animate-[shrink_linear_forwards]"
          style={{ animationDuration: `${duration}ms` }}
        />
      </div>
    </div>
  );
}
