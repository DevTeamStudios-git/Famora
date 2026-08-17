import type { LucideIcon } from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Show unread badge source if provided. */
  badgeKey?: string;
  /** Feature key required for this item to appear (family_features). */
  featureKey?: string;
  /** Only visible to administrators (Admin Panel). */
  adminOnly?: boolean;
  /** Permission required (checked server-side too). */
  permission?: string;
};

export const SITE_NAME = "Famora";