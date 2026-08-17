// Centralized permission-key registry (§42.32) and the default permission set
// granted to each internal role. Per-family overrides happen through
// FamilyGrant rows and are merged in `resolveEffectivePermissions`.

import type { InternalRole } from "@/lib/authorization/roles";

export const PERMISSIONS = {
  // family
  "family.read": "Read family information",
  "family.update": "Edit family settings",
  "family.delete": "Delete / close the family",
  "family.transfer_ownership": "Transfer Family Chief ownership",
  "family.export": "Export family data",

  // members
  "members.read": "View family members",
  "members.invite": "Invite members",
  "members.remove": "Remove members",
  "members.disable": "Disable member access",
  "members.change_role": "Change member roles",
  "members.manage": "Operational member management",

  // whitelist
  "whitelist.read": "View family whitelist",
  "whitelist.add": "Add whitelist entries",
  "whitelist.remove": "Remove whitelist entries",
  "whitelist.disable": "Disable whitelist entries",

  // chat
  "chat.read": "Read family chat",
  "chat.send": "Send messages",
  "chat.edit_own": "Edit own messages",
  "chat.react": "React to messages",
  "chat.poll_create": "Create polls",
  "chat.moderate": "Moderate the family chat",
  "chat.delete_any_message": "Delete any message",
  "chat.pin_any_message": "Pin/unpin any message",

  // dms
  "dms.read": "Read direct messages",
  "dms.send": "Send direct messages",

  // agenda
  "agenda.read": "View the family agenda",
  "agenda.create": "Create events",
  "agenda.update": "Edit events",
  "agenda.delete": "Delete events",
  "agenda.manage": "Administrate the agenda",

  // tasks
  "tasks.read": "View family tasks",
  "tasks.create": "Create tasks",
  "tasks.update": "Update tasks",
  "tasks.delete": "Delete tasks",
  "tasks.assign": "Assign tasks",

  // notebook
  "notebook.family_read": "Read the family notebook",
  "notebook.family_create": "Create family notebook pages",
  "notebook.family_update": "Edit family notebook pages",
  "notebook.family_delete": "Delete family notebook pages",
  "notebook.family_manage": "Administrate the family notebook",
  "notebook.personal": "Full control of own personal notebook",

  // files
  "files.read": "Read the family drive",
  "files.upload": "Upload files",
  "files.download": "Download files",
  "files.manage": "Manage family files",
  "files.delete": "Delete family files",

  // polls
  "polls.read": "View polls",
  "polls.create": "Create polls",
  "polls.vote": "Vote in polls",

  // announcements
  "announcements.read": "Read announcements",
  "announcements.manage": "Create and manage announcements",

  // contacts
  "contacts.read": "Read family contacts",
  "contacts.create": "Create contacts",
  "contacts.manage": "Manage family contacts",

  // recipes
  "recipes.read": "Read family recipes",
  "recipes.create": "Contribute recipes",
  "recipes.manage": "Manage family recipes",

  // memories
  "memories.read": "View family memories",
  "memories.create": "Upload memories",
  "memories.manage": "Manage family memories",

  // notifications
  "notifications.read": "View notifications",
  "notifications.manage_prefs": "Manage notification preferences",

  // tools & admin
  "tools.manage": "Enable/disable family tools",
  "audit.read": "Read administrative audit logs",
  "security.manage": "Manage security settings",
  "security.emergency": "Use Emergency Security Mode",
  "admin_panel.access": "Access the Admin Panel",
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export const PERMISSION_GROUPS: Record<string, readonly PermissionKey[]> = {
  "Family": ["family.read", "family.update", "family.delete", "family.transfer_ownership", "family.export"],
  "Members": ["members.read", "members.invite", "members.remove", "members.disable", "members.change_role", "members.manage"],
  "Whitelist": ["whitelist.read", "whitelist.add", "whitelist.remove", "whitelist.disable"],
  "Chat": ["chat.read", "chat.send", "chat.edit_own", "chat.react", "chat.poll_create", "chat.moderate", "chat.delete_any_message", "chat.pin_any_message"],
  "DMs": ["dms.read", "dms.send"],
  "Agenda": ["agenda.read", "agenda.create", "agenda.update", "agenda.delete", "agenda.manage"],
  "Tasks": ["tasks.read", "tasks.create", "tasks.update", "tasks.delete", "tasks.assign"],
  "Notebook": ["notebook.family_read", "notebook.family_create", "notebook.family_update", "notebook.family_delete", "notebook.family_manage", "notebook.personal"],
  "Files": ["files.read", "files.upload", "files.download", "files.manage", "files.delete"],
  "Polls": ["polls.read", "polls.create", "polls.vote"],
  "Announcements": ["announcements.read", "announcements.manage"],
  "Contacts": ["contacts.read", "contacts.create", "contacts.manage"],
  "Recipes": ["recipes.read", "recipes.create", "recipes.manage"],
  "Memories": ["memories.read", "memories.create", "memories.manage"],
  "Notifications": ["notifications.read", "notifications.manage_prefs"],
  "Administration": ["tools.manage", "audit.read", "security.manage", "security.emergency", "admin_panel.access"],
};

/** Every permission key, exported as a list of strings. */
export const PERMISSION_KEYS: readonly string[] = Object.keys(
  PERMISSIONS,
) as readonly string[];

const memberPermissions: readonly PermissionKey[] = [
  "family.read",
  "members.read",
  "chat.read",
  "chat.send",
  "chat.edit_own",
  "chat.react",
  "chat.poll_create",
  "dms.read",
  "dms.send",
  "agenda.read",
  "agenda.create",
  "agenda.update",
  "agenda.delete",
  "tasks.read",
  "tasks.create",
  "tasks.update",
  "notebook.family_read",
  "notebook.family_create",
  "notebook.family_update",
  "notebook.personal",
  "files.read",
  "files.upload",
  "files.download",
  "polls.read",
  "polls.create",
  "polls.vote",
  "announcements.read",
  "contacts.read",
  "contacts.create",
  "recipes.read",
  "recipes.create",
  "memories.read",
  "memories.create",
  "notifications.read",
  "notifications.manage_prefs",
];

/**
 * Co-Chief defaults = operational administration. Sensitive / destructive
 * permissions (whitelist, members.remove, change_role, security, audit,
 * transfer/delete) are intentionally excluded and only granted per-family
 * through FamilyGrant rows (§41.7).
 */
const coChiefPermissions: readonly PermissionKey[] = [
  ...memberPermissions,
  "members.invite",
  "members.manage",
  "chat.moderate",
  "chat.delete_any_message",
  "chat.pin_any_message",
  "agenda.manage",
  "tasks.delete",
  "tasks.assign",
  "notebook.family_delete",
  "notebook.family_manage",
  "files.manage",
  "files.delete",
  "announcements.manage",
  "contacts.manage",
  "recipes.manage",
  "memories.manage",
  "tools.manage",
  "admin_panel.access",
];

/** Family Chief and Hidden Admin share the full Family Manager permission set. */
const fullManagerPermissions: readonly PermissionKey[] = [

  ...Object.keys(PERMISSIONS) as PermissionKey[],
];

export const DEFAULT_ROLE_PERMISSIONS: Record<InternalRole, readonly PermissionKey[]> = {
  MEMBER: memberPermissions,
  CO_FAMILY_CHIEF: coChiefPermissions,
  FAMILY_CHIEF: fullManagerPermissions,
  HIDDEN_ADMIN: fullManagerPermissions,
};