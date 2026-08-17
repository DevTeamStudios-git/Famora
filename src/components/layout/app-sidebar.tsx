"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, Search, ShieldCheck } from "lucide-react";
import { mainNavItems, toolsNavItems } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarNavItem } from "@/components/layout/sidebar-nav-item";
import { UserMenu, type ShellUser } from "@/components/layout/user-menu";

type AppSidebarProps = {
  user: ShellUser;
  familyName: string;
  isAdmin: boolean;
  enabledFeatures: string[];
  badges?: Record<string, number>;
};

const STORAGE_KEY = "famora.sidebar.collapsed";

function subscribeCollapsed(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("famora.sidebar:change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("famora.sidebar:change", callback);
  };
}

function getCollapsedSnapshot() {
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

export function AppSidebar({
  user,
  familyName,
  isAdmin,
  enabledFeatures,
  badges = {},
}: AppSidebarProps) {
  const collapsed = React.useSyncExternalStore(
    subscribeCollapsed,
    getCollapsedSnapshot,
    () => false,
  );

  const setCollapsed = React.useCallback((value: boolean) => {
    window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
    window.dispatchEvent(new CustomEvent("famora.sidebar:change"));
  }, []);

  const visibleMain = mainNavItems.filter(
    (item) => !item.featureKey || enabledFeatures.includes(item.featureKey),
  );
  const visibleTools = toolsNavItems.filter(
    (item) => !item.featureKey || enabledFeatures.includes(item.featureKey),
  );

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex",
        collapsed ? "w-16" : "w-64",
      )}
    >
      {/* Top: identity + family */}
      <div className={cn("flex flex-col gap-4 p-4", collapsed && "p-3")}>
        <div className={cn("flex items-center gap-2", collapsed && "justify-center")}>
          <Link
            href="/"
            className="flex items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              F
            </span>
            {!collapsed ? (
              <span className="text-lg font-semibold tracking-tight">
                {familyName}
              </span>
            ) : null}
          </Link>
        </div>

        {/* Global search entry point */}
        <Button
          variant="outline"
          className={cn(
            "justify-start gap-2 text-muted-foreground",
            collapsed && "px-2",
          )}
          onClick={() =>
            document.dispatchEvent(new CustomEvent("famora:open-search"))
          }
        >
          <Search className="h-4 w-4" aria-hidden />
          {!collapsed ? (
            <>
              <span className="flex-1 text-left">Search</span>
              <kbd className="pointer-events-none rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                Ctrl K
              </kbd>
            </>
          ) : null}
        </Button>
      </div>

      {/* Navigation */}
      <nav
        className="flex-1 space-y-1 overflow-y-auto px-3"
        aria-label="Main navigation"
      >
        {visibleMain.map((item) => (
          <SidebarNavItem
            key={item.href}
            item={item}
            badgeCount={item.badgeKey ? badges[item.badgeKey] ?? 0 : 0}
            collapsed={collapsed}
          />
        ))}
        <Separator className="my-3" />
        {!collapsed ? (
          <div className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Tools
          </div>
        ) : null}
        {visibleTools.map((item) => (
          <SidebarNavItem
            key={item.href}
            item={item}
            collapsed={collapsed}
          />
        ))}
        {isAdmin ? (
          <>
            <Separator className="my-3" />
            <SidebarNavItem
              item={{ title: "Admin Panel", href: "/admin", icon: ShieldCheck }}
              collapsed={collapsed}
            />
          </>
        ) : null}
      </nav>

      {/* Bottom: quick action + user */}
      <div className="border-t border-sidebar-border p-3">
        <div className={cn("flex items-center gap-2", collapsed && "flex-col")}>
          <Button
            size={collapsed ? "icon" : "default"}
            className={cn("flex-1", collapsed && "flex-none")}
            onClick={() =>
              document.dispatchEvent(new CustomEvent("famora:open-create"))
            }
          >
            <Plus className="h-4 w-4" aria-hidden />
            {!collapsed ? "Create" : null}
          </Button>
          <UserMenu user={user} />
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" aria-hidden />
            ) : (
              <ChevronLeft className="h-4 w-4" aria-hidden />
            )}
          </Button>
        </div>
      </div>
    </aside>
  );
}