"use client";

import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { TopBar } from "./TopBar";

interface AppShellProps {
  children: ReactNode;
  onAddTask?: () => void;
  topBarExtra?: ReactNode;
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
}

export function AppShell({
  children,
  onAddTask,
  topBarExtra,
  searchQuery,
  onSearchChange,
}: AppShellProps) {
  return (
    <div className="min-h-dvh">
      <Sidebar />
      <div className="md:ml-64 flex flex-col min-h-dvh">
        <TopBar
          onAddTask={onAddTask}
          topBarExtra={topBarExtra}
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
        />
        <main className="flex-1 pb-[56px] md:pb-0">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
