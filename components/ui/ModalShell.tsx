"use client";

import type { PropsWithChildren } from "react";

type ModalShellProps = PropsWithChildren<{
  /** Accessible name for the dialog. */
  ariaLabel: string;
  /** Called when user clicks the backdrop. */
  onClose: () => void;
  /** Optional extra classes for the dialog container. */
  className?: string;
}>;

export function ModalShell({ ariaLabel, onClose, className, children }: ModalShellProps) {
  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-bg-base/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center md:p-6">
        <div
          className={[
            "bg-surface-elevated border-t border-x md:border border-border rounded-t-[8px] md:rounded-[4px]",
            "w-full",
            "max-h-[85dvh] md:max-h-[80vh]",
            "flex flex-col min-h-0 overflow-hidden",
            "animate-[slideUp_200ms_ease-out] md:animate-[fadeIn_150ms_ease-out]",
            className ?? "",
          ].join(" ")}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
        >
          {children}
        </div>
      </div>
    </>
  );
}

