"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { adminNavItems } from "@/lib/navigation";

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="space-y-1" aria-label="Admin">
      {adminNavItems.map((item) => {
        const actualHref = item.href;
        const active =
          actualHref === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(actualHref);
        return (
          <Link
            key={actualHref}
            href={actualHref}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{item.title}</span>
          </Link>
        );
      })}
    </nav>
  );
}