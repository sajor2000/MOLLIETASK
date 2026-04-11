"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/constants";
import { Icon } from "@/components/ui/Icon";
import { useWorkspace } from "@/hooks/useWorkspace";

interface BottomNavProps {
  onAddTask?: () => void;
}

export function BottomNav({ onAddTask }: BottomNavProps) {
  const pathname = usePathname();
  const { isMember } = useWorkspace();

  const visibleItems = isMember
    ? NAV_ITEMS.filter((item) => !item.ownerOnly)
    : NAV_ITEMS;

  return (
    <>
      {onAddTask && (
        <button
          onClick={onAddTask}
          className="md:hidden fixed bottom-[72px] right-4 z-50 flex items-center justify-center w-14 h-14 bg-accent text-bg-base rounded-full shadow-lg shadow-accent/20 active:scale-95 transition-transform duration-150"
          aria-label="Add task"
        >
          <Icon name="add" className="w-7 h-7" />
        </button>
      )}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex justify-around items-center h-[56px] bg-surface/80 backdrop-blur-[20px] border-t border-border safe-area-bottom">
      {visibleItems.map((item) => {
        const isActive =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-[4px] transition-colors duration-200 ${
              isActive
                ? "text-accent bg-surface-elevated scale-95"
                : "text-text-secondary hover:text-accent"
            }`}
          >
            <Icon name={item.icon} className="w-5 h-5" />
            <span className="text-[11px] font-medium uppercase tracking-wide">
              {item.label}
            </span>
          </Link>
        );
      })}

      <Link
        href="/sign-out"
        className="flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-[4px] text-text-secondary hover:text-destructive transition-colors duration-200"
      >
        <Icon name="logout" className="w-5 h-5" />
        <span className="text-[11px] font-medium uppercase tracking-wide">Out</span>
      </Link>
    </nav>
    </>
  );
}
