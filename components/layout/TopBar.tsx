"use client";

import { ReactNode, useState } from "react";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/constants";
import { Icon } from "@/components/ui/Icon";
import { SearchInput } from "./SearchInput";

interface TopBarProps {
  onAddTask?: () => void;
  onOpenTemplates?: () => void;
  topBarExtra?: ReactNode;
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
}

export function TopBar({ onAddTask, onOpenTemplates, topBarExtra, searchQuery, onSearchChange }: TopBarProps) {
  const pathname = usePathname();
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const currentPage = NAV_ITEMS.find((item) =>
    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
  );

  return (
    <header className="sticky top-0 z-30 bg-surface/80 backdrop-blur-md border-b border-border safe-area-top">
      <div className="flex items-center justify-between h-[var(--topbar-height)] px-4 sm:px-8">
        <div className="flex items-center gap-4 min-w-0 flex-1">
          {/* Mobile: search expanded replaces title */}
          {mobileSearchOpen && onSearchChange ? (
            <div className="flex md:hidden items-center gap-2 flex-1 min-w-0">
              <SearchInput value={searchQuery ?? ""} onChange={onSearchChange} autoFocus />
              <button
                type="button"
                onClick={() => { setMobileSearchOpen(false); onSearchChange(""); }}
                className="text-text-muted text-[12px] shrink-0"
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              <div className="min-w-0">
                <span className="md:hidden block text-[15px] font-medium text-accent tracking-tight truncate">
                  {currentPage?.label ?? "Tasks"}
                </span>
                <span className="md:hidden block text-[10px] uppercase tracking-[0.2em] text-text-muted mt-0.5 truncate">
                  Dental Task OS
                </span>
              </div>
              {currentPage && (
                <h2 className="hidden md:block text-xl font-medium text-accent tracking-tight">
                  {currentPage.label}
                </h2>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          {/* Desktop search */}
          {onSearchChange && (
            <div className="hidden md:flex">
              <SearchInput value={searchQuery ?? ""} onChange={onSearchChange} />
            </div>
          )}

          {topBarExtra && (
            <div className="hidden md:flex">{topBarExtra}</div>
          )}

          {/* Mobile search toggle */}
          {onSearchChange && !mobileSearchOpen && (
            <button
              type="button"
              onClick={() => setMobileSearchOpen(true)}
              className="md:hidden text-text-muted hover:text-text-secondary transition-colors"
              aria-label="Search tasks"
            >
              <Icon name="search" className="w-5 h-5" />
            </button>
          )}

          {onOpenTemplates && (
            <button
              type="button"
              onClick={onOpenTemplates}
              aria-label="Open task templates"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-surface border border-border/30 text-text-secondary text-[12px] font-medium rounded-[4px] hover:border-accent/30 hover:text-accent transition-colors duration-200"
            >
              <Icon name="auto_awesome" className="w-[16px] h-[16px]" />
              <span className="hidden sm:inline">Templates</span>
            </button>
          )}

          {onAddTask && (
            <button
              type="button"
              onClick={onAddTask}
              aria-label="Add task"
              className="flex items-center gap-1.5 px-4 py-1.5 bg-accent text-bg-base text-[12px] font-medium rounded-[4px] hover:opacity-90 transition-opacity duration-200"
            >
              <Icon name="add" className="w-[18px] h-[18px]" />
              <span className="hidden sm:inline">Add Task</span>
            </button>
          )}
        </div>
      </div>

      {topBarExtra && !mobileSearchOpen && (
        <div className="md:hidden px-4 pb-3 border-t border-border/60">
          <div className="pt-3">
            {topBarExtra}
          </div>
        </div>
      )}
    </header>
  );
}
