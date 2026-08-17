import {
  Home,
  CalendarDays,
  MessagesSquare,
  MessageCircle,
  ListChecks,
  BookOpen,
  Folder,
  Users,
  Megaphone,
  Images,
  Settings,
  ChefHat,
  ContactRound,
  Bell,
  Search,
  ShieldCheck,
} from "lucide-react";
import type { NavItem } from "@/types/navigation";

/**
 * Main navigation for the family shell. Admin items are defined separately in
 * `adminNavItems` and only rendered for authorized administrators — server-side
 * checks remain the enforcement layer.
 */
export const mainNavItems: readonly NavItem[] = [
  { title: "Home", href: "/", icon: Home },
  { title: "Agenda", href: "/agenda", icon: CalendarDays, featureKey: "agenda" },
  { title: "Family Chat", href: "/chat", icon: MessagesSquare, badgeKey: "chat", featureKey: "chat" },
  { title: "DMs", href: "/dms", icon: MessageCircle, badgeKey: "dms", featureKey: "dms" },
  { title: "Tasks", href: "/tasks", icon: ListChecks, badgeKey: "tasks", featureKey: "tasks" },
  { title: "Family Notebook", href: "/notebook", icon: BookOpen, featureKey: "notebook" },
  { title: "Personal Notebook", href: "/notebook/personal", icon: BookOpen, featureKey: "notebook" },
  { title: "Files", href: "/files", icon: Folder, badgeKey: "files", featureKey: "files" },
  { title: "Members", href: "/members", icon: Users },
  { title: "Announcements", href: "/announcements", icon: Megaphone, badgeKey: "announcements", featureKey: "announcements" },
  { title: "Memories", href: "/memories", icon: Images, featureKey: "memories" },
];

export const toolsNavItems: readonly NavItem[] = [
  { title: "Tools", href: "/tools", icon: Settings },
  { title: "Contacts", href: "/contacts", icon: ContactRound, featureKey: "contacts" },
  { title: "Recipes", href: "/tools/recipes", icon: ChefHat, featureKey: "recipes" },
];

export const systemNavItems: readonly NavItem[] = [
  { title: "Notifications", href: "/notifications", icon: Bell, badgeKey: "notifications" },
  { title: "Search", href: "/search", icon: Search, permission: "search.read" },
  { title: "Settings", href: "/settings", icon: Settings },
];

export const adminNavItems: readonly NavItem[] = [
  { title: "Admin Overview", href: "/admin", icon: ShieldCheck, adminOnly: true },
  { title: "Family Access", href: "/admin/access", icon: ShieldCheck, adminOnly: true, permission: "whitelist.read" },
  { title: "Members", href: "/admin/members", icon: Users, adminOnly: true, permission: "members.read" },
  { title: "Roles & Permissions", href: "/admin/roles", icon: ShieldCheck, adminOnly: true, permission: "audit.read" },
  { title: "Moderation", href: "/admin/moderation", icon: ShieldCheck, adminOnly: true, permission: "chat.moderate" },
  { title: "Chat Management", href: "/admin/chat", icon: ShieldCheck, adminOnly: true, permission: "chat.moderate" },
  { title: "Agenda Management", href: "/admin/agenda", icon: CalendarDays, adminOnly: true, permission: "agenda.manage" },
  { title: "Tools Management", href: "/admin/tools", icon: Settings, adminOnly: true, permission: "tools.manage" },
  { title: "Files & Storage", href: "/admin/files", icon: Folder, adminOnly: true, permission: "files.manage" },
  { title: "Announcements", href: "/admin/announcements", icon: Megaphone, adminOnly: true, permission: "announcements.manage" },
  { title: "Notifications", href: "/admin/notifications", icon: Bell, adminOnly: true, permission: "tools.manage" },
  { title: "Audit Log", href: "/admin/audit-log", icon: ShieldCheck, adminOnly: true, permission: "audit.read" },
  { title: "Family Settings", href: "/admin/family", icon: Settings, adminOnly: true, permission: "family.update" },
  { title: "Security", href: "/admin/security", icon: ShieldCheck, adminOnly: true, permission: "security.manage" },
];