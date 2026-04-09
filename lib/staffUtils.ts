import type { Doc } from "@/convex/_generated/dataModel";

/** Two-letter initials for assignee chips (first char of first two words, or first two chars). */
export function staffInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  const one = parts[0] ?? "?";
  return one.slice(0, 2).toUpperCase();
}

export function staffLabel(staff: Doc<"staffMembers">): string {
  return `${staff.name} — ${staff.roleTitle}`;
}
