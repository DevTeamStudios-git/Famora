// Realtime channel naming (§23, §42.12) and event type registry.
//
// Channels must be private and authorized by RLS — a user must never be able
// to subscribe to another family's or another user's private channel.

export const REALTIME_CHANNELS = {
  familyChat: (familyId: string) => `family:${familyId}:chat`,
  familyPresence: (familyId: string) => `family:${familyId}:presence`,
  dm: (conversationId: string) => `dm:${conversationId}`,
  agenda: (familyId: string) => `family:${familyId}:agenda`,
  familyActivity: (familyId: string) => `family:${familyId}:activity`,
  notifications: (userId: string) => `user:${userId}:notifications`,
  admin: (familyId: string) => `admin:${familyId}`,
} as const;

export const REALTIME_POSTGRES_TABLES = {
  messages: "messages",
  conversations: "conversations",
  calendarEvents: "calendar_events",
  tasks: "tasks",
  notifications: "notifications",
  activity: "activity_events",
} as const;

/** Family activity feed event types (§4). */
export const ACTIVITY_TYPES = {
  EVENT_CREATED: "EVENT_CREATED",
  EVENT_UPDATED: "EVENT_UPDATED",
  FILE_UPLOADED: "FILE_UPLOADED",
  NOTE_CREATED: "NOTE_CREATED",
  ANNOUNCEMENT_PUBLISHED: "ANNOUNCEMENT_PUBLISHED",
  POLL_CREATED: "POLL_CREATED",
  MEMBER_JOINED: "MEMBER_JOINED",
  TASK_COMPLETED: "TASK_COMPLETED",
} as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[keyof typeof ACTIVITY_TYPES];

/** Typing indicator broadcast payload. */
export type TypingPayload = {
  conversationId: string;
  memberId: string;
  displayName: string;
  isTyping: boolean;
};