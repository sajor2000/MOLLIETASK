import { useState } from "react";
import type { Workstream } from "@/lib/constants";

export function useWorkstreamFilter() {
  const [workstreamFilter, setWorkstreamFilter] = useState<Workstream | null>(null);
  return { workstreamFilter, setWorkstreamFilter } as const;
}
