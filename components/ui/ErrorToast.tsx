"use client";

import { useEffect, useRef } from "react";
import { Icon } from "@/components/ui/Icon";

interface ErrorToastProps {
  message: string;
  onDismiss: () => void;
  duration?: number;
}

export function ErrorToast({
  message,
  onDismiss,
  duration = 4000,
}: ErrorToastProps) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    const timer = setTimeout(() => onDismissRef.current(), duration);
    return () => clearTimeout(timer);
  }, [duration]);

  return (
    <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 animate-[slideUp_200ms_ease-out]">
      <div className="flex items-center gap-3 bg-surface-elevated border border-destructive/30 rounded-[4px] px-4 py-3 min-w-[280px]">
        <Icon name="close" className="w-[18px] h-[18px] text-destructive" />
        <span className="flex-1 text-[13px] text-text-primary">{message}</span>
        <button
          onClick={onDismiss}
          className="text-text-muted hover:text-text-secondary transition-colors duration-200"
        >
          <Icon name="close" className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
