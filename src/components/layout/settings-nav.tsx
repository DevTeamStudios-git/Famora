"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const settingsSections = [
  { href: "/settings", label: "Overview" },
  { href: "/settings/profile", label: "My Profile" },
  { href: "/settings/appearance", label: "Appearance" },
  { href: "/settings/notifications", label: "Notifications" },
  { href: "/settings/privacy", label: "Privacy" },
  { href: "/settings/chat", label: "Chat & Messaging" },
  { href: "/settings/agenda", label: "Agenda & Calendar" },
  { href: "/settings/personal-notebook", label: "Personal Notebook" },
  { href: "/settings/family-notebook", label: "Family Notebook" },
  { href: "/settings/files", label: "Files & Uploads" },
  { href: "/settings/accessibility", label: "Accessibility" },
  { href: "/settings/language", label: "Language & Region" },
  { href: "/settings/family-preferences", label: "Family Preferences" },
  { href: "/settings/role", label: "My Role & Permissions" },
  { href: "/settings/connected-accounts", label: "Connected Accounts" },
  { href: "/settings/sessions", label: "Sessions & Devices" },
] as const;

export function SettingsNav({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <nav className={cn("space-y-1", className)} aria-label="Settings">
      {settingsSections.map((section) => {
        const active =
          section.href === "/settings"
            ? pathname === "/settings"
            : pathname.startsWith(section.href);
        return (
          <Link
            key={section.href}
            href={section.href}
            className={cn(
              "flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}