"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  CalendarDays,
  MessagesSquare,
  MoreHorizontal,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SidebarNavItem } from "@/components/layout/sidebar-nav-item";
import { mainNavItems, toolsNavItems } from "@/lib/navigation";

const bottomItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/chat", label: "Chat", icon: MessagesSquare, featureKey: "chat" },
  { href: "/agenda", label: "Agenda", icon: CalendarDays, featureKey: "agenda" },
  { href: "/tools", label: "Tools", icon: Settings },
];

type MobileNavProps = {
  enabledFeatures: string[];
};

export function MobileNav({ enabledFeatures }: MobileNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  const visibleBottom = bottomItems.filter(
    (item) => !item.featureKey || enabledFeatures.includes(item.featureKey),
  );
  const visibleMain = mainNavItems.filter(
    (item) => !item.featureKey || enabledFeatures.includes(item.featureKey),
  );
  const visibleTools = toolsNavItems.filter(
    (item) => !item.featureKey || enabledFeatures.includes(item.featureKey),
  );

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex h-14 items-stretch border-t border-border bg-background/95 backdrop-blur sm:hidden"
        aria-label="Primary"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {visibleBottom.map((item) => {
          const Icon = item.icon;
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="h-5 w-5" aria-hidden />
              {item.label}
            </Link>
          );
        })}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                pathname === "/assets" ? "text-primary" : "text-muted-foreground",
              )}
              aria-label="Open menu"
            >
              <MoreHorizontal className="h-5 w-5" aria-hidden />
              More
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto sm:hidden">
            <SheetHeader>
              <SheetTitle>Menu</SheetTitle>
            </SheetHeader>
            <div className="mt-4 space-y-1 pb-[calc(3.5rem+env(safe-area-inset-bottom))]">
              {visibleMain.map((item) => (
                <SidebarNavItem key={item.href} item={item} onNavigate={() => setOpen(false)} />
              ))}
              <div className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Tools
              </div>
              {visibleTools.map((item) => (
                <SidebarNavItem key={item.href} item={item} onNavigate={() => setOpen(false)} />
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </nav>
    </>
  );
}