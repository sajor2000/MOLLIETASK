"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/constants";
import { Icon } from "@/components/ui/Icon";
import { useWorkspace } from "@/hooks/useWorkspace";

export function Sidebar() {
  const pathname = usePathname();
  const { isMember } = useWorkspace();

  const visibleItems = isMember
    ? NAV_ITEMS.filter((item) => !item.ownerOnly)
    : NAV_ITEMS;

  return (
    <aside className="hidden md:flex flex-col w-64 h-dvh fixed left-0 top-0 bg-bg-base border-r border-border py-8 px-4">
      <div className="mb-10 px-2">
        <h1 className="text-[15px] font-medium text-accent tracking-tight">
          Dental Task OS
        </h1>
        <p className="text-[10px] uppercase tracking-[0.2em] text-text-muted mt-1">
          Task Sanctuary
        </p>
      </div>

      <nav className="flex-1 space-y-1">
        {visibleItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 text-[13px] rounded-[4px] transition-colors duration-200 ${
                isActive
                  ? "text-accent font-medium bg-surface border-r-2 border-accent"
                  : "text-text-muted hover:text-text-secondary hover:bg-surface"
              }`}
            >
              <Icon name={item.icon} className="w-5 h-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

    </aside>
  );
}
