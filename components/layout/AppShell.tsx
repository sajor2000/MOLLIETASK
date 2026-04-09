"use client";

import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { TopBar } from "./TopBar";

interface AppShellProps {
  children: ReactNode;
  onAddTask?: () => void;
  topBarExtra?: ReactNode;
}

export function AppShell({
  children,
  onAddTask,
  topBarExtra,
}: AppShellProps) {
  return (
    <div className="min-h-dvh">
      <Sidebar />
      <div className="md:ml-64 flex flex-col min-h-dvh">
        <TopBar onAddTask={onAddTask} topBarExtra={topBarExtra} />
        <main className="flex-1 pb-[56px] md:pb-0">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
