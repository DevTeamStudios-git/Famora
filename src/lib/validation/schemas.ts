// Centralized Zod schemas for runtime validation (§42.15).
// Never trust TypeScript types to validate runtime input.

import { z } from "zod";
import {
  type InternalRole,
} from "@/lib/authorization/roles";
import { normalizeEmail } from "@/lib/utils";

export const emailSchema = z
  .string()
  .trim()
  .email()
  .transform(normalizeEmail);

export const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  preferredName: z.string().trim().max(80).optional().nullable(),
  bio: z.string().trim().max(500).optional().nullable(),
  birthday: z.string().date().optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  timezone: z.string().max(64).optional().nullable(),
  language: z.string().max(16).optional().nullable(),
});

export const internalRoleSchema = z.enum(["FAMILY_CHIEF", "CO_FAMILY_CHIEF", "HIDDEN_ADMIN", "MEMBER"] as [
  InternalRole,
  ...InternalRole[],
]);

export const whitelistEntrySchema = z.object({
  email: emailSchema,
  internalRole: internalRoleSchema,
});

export const featureToggleSchema = z.object({
  key: z.string().min(1),
  enabled: z.boolean(),
});

export const eventSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).optional().nullable(),
  location: z.string().max(300).optional().nullable(),
  videoCallLink: z.string().url().optional().nullable(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  allDay: z.boolean().default(false),
  visibility: z.enum(["FAMILY", "PRIVATE"]).default("FAMILY"),
  categoryId: z.string().uuid().optional().nullable(),
  recurrenceRule: z.string().max(500).optional().nullable(),
});

export const messageSchema = z.object({
  body: z.string().max(10_000),
  replyToId: z.string().uuid().optional().nullable(),
});

export const taskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).optional().nullable(),
  dueAt: z.string().datetime().optional().nullable(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  status: z.enum(["TODO", "IN_PROGRESS", "COMPLETED"]).default("TODO"),
  assigneeIds: z.array(z.string().uuid()).max(50).default([]),
  parentId: z.string().uuid().optional().nullable(),
});

export const pollSchema = z.object({
  question: z.string().trim().min(1).max(300),
  options: z.array(z.string().trim().min(1).max(120)).min(2).max(10),
  isAnonymous: z.boolean().default(false),
  isMultipleChoice: z.boolean().default(false),
  allowChangeVote: z.boolean().default(true),
  deadline: z.string().datetime().optional().nullable(),
});

export const notebookPageSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.unknown(), // validated as Tiptap document JSON in the editor layer
});

export const announcementSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.unknown(),
  priority: z.enum(["NORMAL", "IMPORTANT", "URGENT"]).default("NORMAL"),
  scheduledFor: z.string().datetime().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
});

export const contactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().max(80),
  phone: z.string().max(40).optional().nullable(),
  email: z.string().email().optional().nullable(),
  address: z.string().max(300).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  website: z.string().url().optional().nullable(),
  isFavorite: z.boolean().default(false),
  isEmergency: z.boolean().default(false),
});

export const recipeSchema = z.object({
  title: z.string().trim().min(1).max(200),
  ingredients: z.array(z.unknown()).max(200).default([]),
  instructions: z.unknown(),
  prepMinutes: z.number().int().min(0).optional().nullable(),
  cookMinutes: z.number().int().min(0).optional().nullable(),
  servings: z.number().int().min(1).optional().nullable(),
  categories: z.array(z.string().max(40)).max(12).default([]),
  tags: z.array(z.string().max(40)).max(20).default([]),
});

export const memorySchema = z.object({
  caption: z.string().max(2000).optional().nullable(),
  takenAt: z.string().datetime().optional().nullable(),
  albumId: z.string().uuid().optional().nullable(),
});