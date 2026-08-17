// Global registries shared by the app: feature flags and notification types.
// These are String values in the database (see prisma/schema.prisma) and are
// validated centrally here.

export const FEATURE_KEYS = {
  CHAT: "chat",
  DMS: "dms",
  TASKS: "tasks",
  NOTEBOOK: "notebook",
  FILES: "files",
  POLLS: "polls",
  CONTACTS: "contacts",
  RECIPES: "recipes",
  MEMORIES: "memories",
  ANNOUNCEMENTS: "announcements",
} as const;

export type FeatureKey = (typeof FEATURE_KEYS)[keyof typeof FEATURE_KEYS];

export const FEATURE_KEYS_LIST: readonly string[] = Object.values(FEATURE_KEYS);

export const NOTIFICATION_TYPES = {
  NEW_FAMILY_MESSAGE: "NEW_FAMILY_MESSAGE",
  NEW_DM: "NEW_DM",
  MENTION: "MENTION",
  REPLY: "REPLY",
  REACTION: "REACTION",
  EVENT_CREATED: "EVENT_CREATED",
  EVENT_REMINDER: "EVENT_REMINDER",
  EVENT_MODIFIED: "EVENT_MODIFIED",
  TASK_ASSIGNED: "TASK_ASSIGNED",
  TASK_DEADLINE: "TASK_DEADLINE",
  POLL_CREATED: "POLL_CREATED",
  ANNOUNCEMENT_PUBLISHED: "ANNOUNCEMENT_PUBLISHED",
  FILE_UPLOADED: "FILE_UPLOADED",
  NOTEBOOK_ACTIVITY: "NOTEBOOK_ACTIVITY",
  BIRTHDAY_REMINDER: "BIRTHDAY_REMINDER",
  SECURITY_ALERT: "SECURITY_ALERT",
} as const;

export type NotificationType =
  (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

export const NOTIFICATION_CATEGORIES: Record<string, string[]> = {
  "Family Chat": ["NEW_FAMILY_MESSAGE", "MENTION", "REPLY", "REACTION"],
  "DMs": ["NEW_DM", "MENTION", "REPLY", "REACTION"],
  "Agenda": ["EVENT_CREATED", "EVENT_REMINDER", "EVENT_MODIFIED", "BIRTHDAY_REMINDER"],
  "Tasks": ["TASK_ASSIGNED", "TASK_DEADLINE"],
  "Family Tools": ["POLL_CREATED", "ANNOUNCEMENT_PUBLISHED", "FILE_UPLOADED", "NOTEBOOK_ACTIVITY"],
};