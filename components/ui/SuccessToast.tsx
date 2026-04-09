"use client";

import { useEffect, useRef } from "react";
import { Icon } from "@/components/ui/Icon";

interface SuccessToastProps {
  message: string;
  onDismiss: () => void;
  duration?: number;
}

export function SuccessToast({
  message,
  onDismiss,
  duration = 3000,
}: SuccessToastProps) {
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  useEffect(() => {
    const timer = setTimeout(() => onDismissRef.current(), duration);
    return () => clearTimeout(timer);
  }, [duration, message]);

  return (
    <div role="status" aria-live="polite" className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 animate-[slideUp_200ms_ease-out]">
      <div className="flex items-center gap-3 bg-surface-elevated border border-success/30 rounded-[4px] px-4 py-3 min-w-[280px]">
        <Icon name="check_circle" className="w-[18px] h-[18px] text-success" />
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
