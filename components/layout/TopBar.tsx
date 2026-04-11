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
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-4 md:px-8 bg-surface/80 backdrop-blur-md border-b border-border">
      <div className="flex items-center gap-4 min-w-0">
        {/* Mobile: search expanded replaces title */}
        {mobileSearchOpen && onSearchChange ? (
          <div className="flex md:hidden items-center gap-2 flex-1">
            <SearchInput value={searchQuery ?? ""} onChange={onSearchChange} />
            <button
              onClick={() => { setMobileSearchOpen(false); onSearchChange(""); }}
              className="text-text-muted text-[12px]"
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            {/* Mobile logo */}
            <span className="md:hidden text-[15px] font-medium text-accent tracking-tight">
              Dental Task OS
            </span>
            {/* Desktop page title */}
            {currentPage && (
              <h2 className="hidden md:block text-xl font-medium text-accent tracking-tight">
                {currentPage.label}
              </h2>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-2 md:gap-4">
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
            onClick={() => setMobileSearchOpen(true)}
            className="md:hidden p-2 text-text-muted hover:text-text-secondary transition-colors"
            aria-label="Search"
          >
            <Icon name="search" className="w-5 h-5" />
          </button>
        )}

        {onOpenTemplates && (
          <button
            onClick={onOpenTemplates}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface border border-border/30 text-text-secondary text-[12px] font-medium rounded-[4px] hover:border-accent/30 hover:text-accent transition-colors duration-200"
          >
            <Icon name="auto_awesome" className="w-[16px] h-[16px]" />
            <span className="hidden sm:inline">Templates</span>
          </button>
        )}

        {onAddTask && (
          <button
            onClick={onAddTask}
            className="flex items-center gap-1.5 px-3 py-2 md:px-4 md:py-1.5 bg-accent text-bg-base text-[12px] font-medium rounded-[4px] hover:opacity-90 transition-opacity duration-200"
          >
            <Icon name="add" className="w-[18px] h-[18px]" />
            <span className="hidden md:inline">Add Task</span>
          </button>
        )}
      </div>
    </header>
  );
}
