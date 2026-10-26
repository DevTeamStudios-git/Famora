"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/types/navigation";
import { Badge } from "@/components/ui/badge";

type SidebarNavItemProps = {
  item: NavItem;
  badgeCount?: number;
  collapsed?: boolean;
  onNavigate?: () => void;
};

export function SidebarNavItem({
  item,
  badgeCount = 0,
  collapsed = false,
  onNavigate,
}: SidebarNavItemProps) {
  const pathname = usePathname();
  const Icon = item.icon;
  const active =
    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-label={collapsed ? item.title : undefined}
      title={collapsed ? item.title : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex min-h-11 items-center gap-3 rounded-full px-5 py-2.5 text-sm font-medium transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
        collapsed && "justify-center px-0",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      {!collapsed ? (
        <>
          <span className="truncate">{item.title}</span>
          {badgeCount > 0 ? (
            <Badge
              className="ml-auto h-5 min-w-5 justify-center rounded-full px-1.5 text-[11px]"
              variant="secondary"
            >
              {badgeCount > 99 ? "99+" : badgeCount}
            </Badge>
          ) : null}
        </>
      ) : null}
    </Link>
  );
}
