"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
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
    <div className="flex flex-col items-center justify-center h-dvh gap-4 px-6">
      <p className="text-[13px] text-text-muted">Something went wrong.</p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="text-[13px] text-accent hover:opacity-80 transition-opacity"
        >
          Try again
        </button>
        <Link
          href="/"
          className="text-[13px] text-text-secondary hover:opacity-80 transition-opacity"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
