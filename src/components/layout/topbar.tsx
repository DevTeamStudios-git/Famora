"use client";
import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Bell, Menu, Search, Sun, Moon, ShieldCheck } from "lucide-react";
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
import { mainNavItems, toolsNavItems, systemNavItems } from "@/lib/navigation";
const subscribeHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
export function Topbar({
  user,
  familyName,
  isAdmin,
  enabledFeatures,
}: {
  user: ShellUser;
  familyName: string;
  isAdmin: boolean;
  enabledFeatures: string[];
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    clientReady,
    serverReady,
  );
  const items = [...mainNavItems, ...toolsNavItems, ...systemNavItems].filter(
    (item) => !item.featureKey || enabledFeatures.includes(item.featureKey),
  );
  const title =
    items
      .filter((item) =>
        item.href === "/" ? pathname === "/" : pathname.startsWith(item.href),
      )
      .sort((a, b) => b.href.length - a.href.length)[0]?.title ??
    "Family workspace";
  return (
    <header className="app-topbar sticky top-0 z-30 flex h-[72px] items-center gap-3 px-4 sm:px-6 lg:px-8">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Open navigation"
          >
            <Menu />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-80 overflow-y-auto p-4">
          <SheetHeader>
            <SheetTitle>{familyName}</SheetTitle>
          </SheetHeader>
          <nav className="mt-6 space-y-1" aria-label="Mobile navigation">
            {items.map((item) => (
              <SidebarNavItem
                key={item.href}
                item={item}
                onNavigate={() => setOpen(false)}
              />
            ))}
            {isAdmin && (
              <SidebarNavItem
                item={{
                  title: "Admin Panel",
                  href: "/admin",
                  icon: ShieldCheck,
                }}
                onNavigate={() => setOpen(false)}
              />
            )}
          </nav>
        </SheetContent>
      </Sheet>
      <div className="min-w-0 lg:hidden">
        <span className="block truncate font-semibold tracking-tight">
          {familyName}
        </span>
        <p className="truncate text-xs text-muted-foreground">{title}</p>
      </div>
      <div className="hidden min-w-40 text-lg font-medium lg:block">
        {title}
      </div>
      <Link
        href="/search"
        className="ml-2 hidden h-12 min-w-0 flex-1 items-center gap-3 rounded-full bg-secondary/80 px-5 text-sm text-muted-foreground sm:flex"
      >
        <Search className="h-5 w-5 shrink-0" />
        <span className="truncate">Search your family workspace</span>
        <kbd className="ml-auto hidden shrink-0 text-xs opacity-60 xl:block">
          Ctrl K
        </kbd>
      </Link>
      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="sm:hidden"
          asChild
          aria-label="Search"
        >
          <Link href="/search">
            <Search />
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle color theme"
          disabled={!hydrated}
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        >
          <Sun className="hidden dark:block" />
          <Moon className="dark:hidden" />
        </Button>
        <Button variant="ghost" size="icon" asChild aria-label="Notifications">
          <Link href="/notifications">
            <Bell />
          </Link>
        </Button>
        <span className="mx-1 h-6 w-px bg-border" />
        <UserMenu user={user} />
      </div>
    </header>
  );
}
