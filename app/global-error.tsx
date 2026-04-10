"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <html lang="en">
      <body className="bg-surface-primary text-text-primary">
        <div className="flex flex-col items-center justify-center h-dvh gap-4 px-6">
          <p className="text-[15px] font-medium">Something went wrong.</p>
          <button
            onClick={reset}
            className="text-[13px] text-accent hover:opacity-80 transition-opacity"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
