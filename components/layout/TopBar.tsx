"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/constants";
import { Icon } from "@/components/ui/Icon";

interface TopBarProps {
  onAddTask?: () => void;
}

export function TopBar({ onAddTask }: TopBarProps) {
  const pathname = usePathname();

  const currentPage = NAV_ITEMS.find((item) =>
    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
  );

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-8 bg-surface/80 backdrop-blur-md border-b border-border">
      <div className="flex items-center gap-4">
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
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden md:flex relative">
          <Icon
            name="search"
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted"
          />
          <input
            type="text"
            readOnly
            placeholder="Search tasks..."
            className="bg-bg-base border border-outline-variant/10 rounded-[4px] pl-9 pr-4 py-1.5 text-[12px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors duration-200 w-48"
          />
        </div>

        <Link
          href="/settings"
          className="hidden md:flex text-text-muted hover:text-accent transition-colors duration-200"
        >
          <Icon name="settings" className="w-5 h-5" />
        </Link>

        <button
          onClick={onAddTask}
          className="flex items-center gap-1.5 px-4 py-1.5 bg-accent text-bg-base text-[12px] font-medium rounded-[4px] hover:opacity-90 transition-opacity duration-200"
        >
          <Icon name="add" className="w-[18px] h-[18px]" />
          <span className="hidden sm:inline">Add Task</span>
        </button>
      </div>
    </header>
  );
}
