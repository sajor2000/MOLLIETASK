interface PriorityDotProps {
  priority: "high" | "normal";
}

export function PriorityDot({ priority }: PriorityDotProps) {
  if (priority !== "high") return null;
  return (
    <span
      className="inline-block w-2 h-2 rounded-full bg-destructive shrink-0"
      aria-label="High priority"
    />
  );
}
