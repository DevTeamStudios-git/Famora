import { z } from "zod";

export const CALENDAR_COLORS = [
  "INDIGO",
  "TEAL",
  "MOSS",
  "AMBER",
  "CORAL",
  "ROSE",
  "VIOLET",
  "SKY",
  "SLATE",
] as const;

const colorSchema = z.enum(CALENDAR_COLORS);
const isoDate = z.string().datetime({ offset: true });

export const eventDraftSchema = z
  .object({
    calendarId: z.string().uuid().optional(),
    categoryId: z.string().uuid().optional(),
    title: z.string().trim().min(1, "Give the event a title").max(200),
    description: z.string().trim().max(10_000).optional(),
    location: z.string().trim().max(300).optional(),
    color: colorSchema.nullish(),
    startsAt: isoDate.optional(),
    endsAt: isoDate.optional(),
    startAt: isoDate.optional(),
    endAt: isoDate.optional(),
    isAllDay: z.boolean().default(false),
    timeZone: z.string().min(1).max(64).default("UTC"),
    recurrenceRule: z.string().max(500).nullish(),
    participantMemberIds: z.array(z.string().uuid()).max(64).default([]),
    reminderMinutes: z.array(z.number().int().min(0).max(40_320)).max(5).default([]),
  })
  .refine(
    (v) => {
      const s = v.startsAt ?? v.startAt;
      const e = v.endsAt ?? v.endAt;
      if (!s || !e) return true;
      return new Date(e) > new Date(s);
    },
    {
      message: "End must be after start",
      path: ["endsAt"],
    },
  )
  .refine(
    (v) => {
      const s = v.startsAt ?? v.startAt;
      const e = v.endsAt ?? v.endAt;
      if (!s || !e) return true;
      return new Date(e).getTime() - new Date(s).getTime() <= 366 * 864e5;
    },
    { message: "Event cannot span more than a year", path: ["endsAt"] },
  );

/** [spec §13] which slice of a series a mutation applies to */
export const recurrenceScopeSchema = z.enum(["THIS", "THIS_AND_FOLLOWING", "ALL"]);

export const eventUpdateSchema = z.object({
  eventId: z.string().uuid(),
  /** original slot start — required to target an instance of a series */
  instanceAt: isoDate.nullish(),
  scope: recurrenceScopeSchema.default("ALL"),
  /** [spec §22] optimistic concurrency token the client last saw */
  expectedVersion: z.number().int().positive(),
  patch: eventDraftSchema.partial().omit({ calendarId: true }).extend({
    calendarId: z.string().uuid().optional(),
  }),
});

export const eventDeleteSchema = z.object({
  eventId: z.string().uuid(),
  instanceAt: isoDate.nullish(),
  scope: recurrenceScopeSchema.default("ALL"),
  expectedVersion: z.number().int().positive(),
});

export const rsvpSchema = z.object({
  eventId: z.string().uuid(),
  status: z.enum(["ACCEPTED", "TENTATIVE", "DECLINED", "NEEDS_ACTION"]),
  note: z.string().trim().max(280).optional(),
});

export const calendarPreferenceSchema = z.object({
  calendarId: z.string().uuid(),
  isVisible: z.boolean(),
});

export type EventDraft = z.infer<typeof eventDraftSchema>;
export type RecurrenceScope = z.infer<typeof recurrenceScopeSchema>;
