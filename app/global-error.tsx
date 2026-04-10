"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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
