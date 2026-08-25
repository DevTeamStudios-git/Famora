"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma/client";
import { getAccessState } from "@/lib/auth/session";
import { hasPermission } from "@/lib/authorization/authorization";
import { revalidatePath } from "next/cache";

const createEventSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional().nullable(),
  location: z.string().max(500).optional().nullable(),
  videoCallLink: z.string().url().optional().nullable(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  allDay: z.boolean().default(false),
  visibility: z.enum(["FAMILY", "PRIVATE"]).default("FAMILY"),
  recurrenceRule: z.string().optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  attendeeIds: z.array(z.string().uuid()).default([]),
  reminders: z.array(z.object({ minutesBefore: z.number().int().positive() })).default([]),
});

const updateEventSchema = createEventSchema.partial();

type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

async function requireAuthorized() {
  const access = await getAccessState();
  if (access.status !== "authorized") throw new Error("Not authorized.");
  return access;
}

export async function createAgendaEvent(
  rawInput: unknown,
): Promise<ActionResult<{ id: string }>> {
  const access = await requireAuthorized();
  if (!hasPermission(access.membership, "agenda.create")) {
    return { ok: false, error: "You don't have permission to create events." };
  }

  const parsed = createEventSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid event data." };
  }
  const input = parsed.data;

  // Validate startAt < endAt
  const start = new Date(input.startAt);
  const end = new Date(input.endAt);
  if (start >= end) {
    return { ok: false, error: "Start time must be before end time." };
  }

  // Validate category belongs to family
  if (input.categoryId) {
    const category = await prisma.eventCategory.findFirst({
      where: { id: input.categoryId, familyId: access.familyId },
    });
    if (!category) {
      return { ok: false, error: "Invalid category." };
    }
  }

  // Validate attendees belong to family
  if (input.attendeeIds.length > 0) {
    const members = await prisma.familyMember.findMany({
      where: { id: { in: input.attendeeIds }, familyId: access.familyId },
      select: { id: true },
    });
    if (members.length !== input.attendeeIds.length) {
      return { ok: false, error: "One or more attendees are not family members." };
    }
  }

  try {
    const event = await prisma.calendarEvent.create({
      data: {
        familyId: access.familyId,
        title: input.title,
        description: input.description,
        location: input.location,
        videoCallLink: input.videoCallLink,
        startAt: start,
        endAt: end,
        allDay: input.allDay,
        visibility: input.visibility,
        recurrenceRule: input.recurrenceRule,
        categoryId: input.categoryId,
        createdByMemberId: access.memberId,
        attendees: input.attendeeIds.length > 0
          ? {
              create: input.attendeeIds.map((memberId) => ({
                memberId,
                rsvp: memberId === access.memberId ? "YES" : "NONE",
              })),
            }
          : undefined,
        reminders: input.reminders.length > 0
          ? {
              create: input.reminders.map((r) => ({
                minutesBefore: r.minutesBefore,
              })),
            }
          : undefined,
      },
      select: { id: true },
    });

    revalidatePath("/agenda");
    return { ok: true, data: { id: event.id } };
  } catch {
    return { ok: false, error: "Couldn't create the event. Please try again." };
  }
}

export async function updateAgendaEvent(
  eventId: string,
  rawInput: unknown,
): Promise<ActionResult<{ id: string }>> {
  const access = await requireAuthorized();
  if (!hasPermission(access.membership, "agenda.update")) {
    return { ok: false, error: "You don't have permission to update events." };
  }

  const parsed = updateEventSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid event data." };
  }
  const input = parsed.data;

  // Validate event exists and belongs to family
  const existing = await prisma.calendarEvent.findFirst({
    where: { id: eventId, familyId: access.familyId, deletedAt: null },
  });
  if (!existing) {
    return { ok: false, error: "Event not found." };
  }

  // If updating times, validate start < end
  if (input.startAt && input.endAt) {
    const start = new Date(input.startAt);
    const end = new Date(input.endAt);
    if (start >= end) {
      return { ok: false, error: "Start time must be before end time." };
    }
  } else if (input.startAt && !input.endAt) {
    const start = new Date(input.startAt);
    if (start >= existing.endAt) {
      return { ok: false, error: "Start time must be before end time." };
    }
  } else if (input.endAt && !input.startAt) {
    const end = new Date(input.endAt);
    if (existing.startAt >= end) {
      return { ok: false, error: "Start time must be before end time." };
    }
  }

  // Validate category
  if (input.categoryId) {
    const category = await prisma.eventCategory.findFirst({
      where: { id: input.categoryId, familyId: access.familyId },
    });
    if (!category) {
      return { ok: false, error: "Invalid category." };
    }
  }

  // Validate attendees
  if (input.attendeeIds) {
    const members = await prisma.familyMember.findMany({
      where: { id: { in: input.attendeeIds }, familyId: access.familyId },
      select: { id: true },
    });
    if (members.length !== input.attendeeIds.length) {
      return { ok: false, error: "One or more attendees are not family members." };
    }
  }

  try {
    const { attendeeIds, reminders, ...eventData } = input;

    await prisma.$transaction(async (tx) => {
      await tx.calendarEvent.update({
        where: { id: eventId },
        data: {
          ...eventData,
          startAt: input.startAt ? new Date(input.startAt) : undefined,
          endAt: input.endAt ? new Date(input.endAt) : undefined,
          updatedByMemberId: access.memberId,
        },
      });

      if (attendeeIds !== undefined) {
        await tx.eventAttendee.deleteMany({ where: { eventId } });
        if (attendeeIds.length > 0) {
          await tx.eventAttendee.createMany({
            data: attendeeIds.map((memberId) => ({
              eventId,
              memberId,
              rsvp: memberId === access.memberId ? "YES" : "NONE",
            })),
          });
        }
      }

      if (reminders !== undefined) {
        await tx.eventReminder.deleteMany({ where: { eventId } });
        if (reminders.length > 0) {
          await tx.eventReminder.createMany({
            data: reminders.map((r) => ({ eventId, minutesBefore: r.minutesBefore })),
          });
        }
      }
    });

    revalidatePath("/agenda");
    return { ok: true, data: { id: eventId } };
  } catch {
    return { ok: false, error: "Couldn't update the event. Please try again." };
  }
}

export async function deleteAgendaEvent(eventId: string): Promise<ActionResult> {
  const access = await requireAuthorized();
  if (!hasPermission(access.membership, "agenda.delete")) {
    return { ok: false, error: "You don't have permission to delete events." };
  }

  const existing = await prisma.calendarEvent.findFirst({
    where: { id: eventId, familyId: access.familyId, deletedAt: null },
  });
  if (!existing) {
    return { ok: false, error: "Event not found." };
  }

  try {
    await prisma.calendarEvent.update({
      where: { id: eventId },
      data: { deletedAt: new Date(), updatedByMemberId: access.memberId },
    });

    revalidatePath("/agenda");
    return { ok: true, data: undefined };
  } catch {
    return { ok: false, error: "Couldn't delete the event. Please try again." };
  }
}

export async function createEventCategory(
  name: string,
  color: string,
): Promise<ActionResult<{ id: string }>> {
  const access = await requireAuthorized();
  if (!hasPermission(access.membership, "agenda.manage")) {
    return { ok: false, error: "You don't have permission to manage categories." };
  }

  try {
    const category = await prisma.eventCategory.create({
      data: { familyId: access.familyId, name, color },
      select: { id: true },
    });

    revalidatePath("/agenda");
    return { ok: true, data: { id: category.id } };
  } catch (e) {
    if (e instanceof Error && e.message.includes("Unique constraint")) {
      return { ok: false, error: "A category with this name already exists." };
    }
    return { ok: false, error: "Couldn't create the category." };
  }
}

export async function updateEventCategory(
  categoryId: string,
  name: string,
  color: string,
): Promise<ActionResult> {
  const access = await requireAuthorized();
  if (!hasPermission(access.membership, "agenda.manage")) {
    return { ok: false, error: "You don't have permission to manage categories." };
  }

  try {
    await prisma.eventCategory.update({
      where: { id: categoryId, familyId: access.familyId },
      data: { name, color },
    });

    revalidatePath("/agenda");
    return { ok: true, data: undefined };
  } catch (e) {
    if (e instanceof Error && e.message.includes("Unique constraint")) {
      return { ok: false, error: "A category with this name already exists." };
    }
    return { ok: false, error: "Couldn't update the category." };
  }
}

export async function deleteEventCategory(categoryId: string): Promise<ActionResult> {
  const access = await requireAuthorized();
  if (!hasPermission(access.membership, "agenda.manage")) {
    return { ok: false, error: "You don't have permission to manage categories." };
  }

  // Check if category has events
  const eventCount = await prisma.calendarEvent.count({
    where: { categoryId, familyId: access.familyId, deletedAt: null },
  });
  if (eventCount > 0) {
    return { ok: false, error: "Cannot delete category with existing events. Reassign or delete events first." };
  }

  try {
    await prisma.eventCategory.delete({ where: { id: categoryId, familyId: access.familyId } });
    revalidatePath("/agenda");
    return { ok: true, data: undefined };
  } catch {
    return { ok: false, error: "Couldn't delete the category." };
  }
}

export async function updateRsvp(eventId: string, rsvp: "NONE" | "YES" | "NO" | "MAYBE"): Promise<ActionResult> {
  const access = await requireAuthorized();
  if (!hasPermission(access.membership, "agenda.read")) {
    return { ok: false, error: "You don't have permission to view the agenda." };
  }

  const existing = await prisma.calendarEvent.findFirst({
    where: { id: eventId, familyId: access.familyId, deletedAt: null },
  });
  if (!existing) {
    return { ok: false, error: "Event not found." };
  }

  try {
    await prisma.eventAttendee.upsert({
      where: { eventId_memberId: { eventId, memberId: access.memberId } },
      create: { eventId, memberId: access.memberId, rsvp },
      update: { rsvp },
    });

    revalidatePath("/agenda");
    return { ok: true, data: undefined };
  } catch {
    return { ok: false, error: "Couldn't update your RSVP." };
  }
}