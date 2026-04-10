"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/constants";
import { Icon } from "@/components/ui/Icon";

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex justify-around items-center h-[56px] bg-surface/80 backdrop-blur-[20px] border-t border-border safe-area-bottom">
      {NAV_ITEMS.map((item) => {
        const isActive =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={`flex flex-col items-center justify-center gap-0.5 px-4 py-1 rounded-[4px] transition-colors duration-200 ${
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
    </nav>
  );
}
