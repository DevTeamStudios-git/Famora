"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, Menu, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SidebarNavItem } from "@/components/layout/sidebar-nav-item";
import { UserMenu, type ShellUser } from "@/components/layout/user-menu";
import { mainNavItems, toolsNavItems } from "@/lib/navigation";

type TopbarProps = {
  user: ShellUser;
  familyName: string;
  isAdmin: boolean;
  enabledFeatures: string[];
};

export function Topbar({
  user,
  familyName,
  isAdmin,
  enabledFeatures,
}: TopbarProps) {
  const [open, setOpen] = React.useState(false);

  const visibleMain = mainNavItems.filter(
    (item) => !item.featureKey || enabledFeatures.includes(item.featureKey),
  );
  const visibleTools = toolsNavItems.filter(
    (item) => !item.featureKey || enabledFeatures.includes(item.featureKey),
  );

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/90 px-4 backdrop-blur lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Open navigation">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="p-4">
            <SheetTitle>Famora</SheetTitle>
          </SheetHeader>
          <div className="px-3">
            <Button
              variant="outline"
              className="w-full justify-start gap-2 text-muted-foreground"
              onClick={() => {
                setOpen(false);
                document.dispatchEvent(new CustomEvent("famora:open-search"));
              }}
            >
              <Search className="h-4 w-4" aria-hidden />
              Search
            </Button>
          </div>
          <div className="mt-4 space-y-1 px-3">
            {visibleMain.map((item) => (
              <SidebarNavItem key={item.href} item={item} onNavigate={() => setOpen(false)} />
            ))}
            <div className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Tools
            </div>
            {visibleTools.map((item) => (
              <SidebarNavItem key={item.href} item={item} onNavigate={() => setOpen(false)} />
            ))}
            {isAdmin ? (
              <SidebarNavItem
                item={{ title: "Admin Panel", href: "/admin", icon: Bell }}
                onNavigate={() => setOpen(false)}
              />
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      <Link href="/" className="flex min-w-0 items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">
          F
        </span>
        <span className="truncate text-base font-semibold">{familyName}</span>
      </Link>

      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Search"
          onClick={() => document.dispatchEvent(new CustomEvent("famora:open-search"))}
        >
          <Search className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" asChild aria-label="Notifications">
          <Link href="/notifications">
            <Bell className="h-5 w-5" />
          </Link>
        </Button>
        <UserMenu user={user} />
      </div>
    </header>
  );
}