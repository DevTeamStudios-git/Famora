import "server-only";

import { prisma } from "@/lib/prisma/client";

export type AgendaEvent = {
  id: string;
  familyId: string;
  categoryId: string | null;
  title: string;
  description: string | null;
  location: string | null;
  videoCallLink: string | null;
  startAt: string;
  endAt: string;
  allDay: boolean;
  visibility: "FAMILY" | "PRIVATE";
  recurrenceRule: string | null;
  createdByMemberId: string;
  updatedByMemberId: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  category: AgendaEventCategory | null;
  attendees: AgendaEventAttendee[];
  reminders: AgendaEventReminder[];
};

export type AgendaEventCategory = {
  id: string;
  familyId: string;
  name: string;
  color: string;
};

export type AgendaEventAttendee = {
  id: string;
  eventId: string;
  memberId: string;
  rsvp: "NONE" | "YES" | "NO" | "MAYBE";
  member: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    displayRole: string;
  };
};

export type AgendaEventReminder = {
  id: string;
  eventId: string;
  minutesBefore: number;
  deliveredAt: string | null;
};

export type AgendaMember = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  displayRole: string;
};

/**
 * Fetches all non-deleted events for a family within a date range.
 */
export async function listFamilyEvents(
  familyId: string,
  memberId: string,
  startAt: Date,
  endAt: Date,
): Promise<AgendaEvent[]> {
  const events = await prisma.calendarEvent.findMany({
    where: {
      familyId,
      deletedAt: null,
      OR: [
        // Events that start within the range
        { startAt: { gte: startAt, lte: endAt } },
        // Events that end within the range
        { endAt: { gte: startAt, lte: endAt } },
        // Events that span the entire range
        { AND: [{ startAt: { lte: startAt } }, { endAt: { gte: endAt } }] },
      ],
    },
    include: {
      category: true,
      attendees: {
        include: {
          member: {
            select: {
              id: true,
              user: { select: { displayName: true, avatarUrl: true } },
              displayRole: true,
            },
          },
        },
      },
      reminders: true,
    },
    orderBy: { startAt: "asc" },
  });

  return events.map((e) => ({
    id: e.id,
    familyId: e.familyId,
    categoryId: e.categoryId,
    title: e.title,
    description: e.description,
    location: e.location,
    videoCallLink: e.videoCallLink,
    startAt: e.startAt.toISOString(),
    endAt: e.endAt.toISOString(),
    allDay: e.allDay,
    visibility: e.visibility,
    recurrenceRule: e.recurrenceRule,
    createdByMemberId: e.createdByMemberId,
    updatedByMemberId: e.updatedByMemberId,
    deletedAt: e.deletedAt?.toISOString() ?? null,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
    category: e.category
      ? { id: e.category.id, familyId: e.category.familyId, name: e.category.name, color: e.category.color }
      : null,
    attendees: e.attendees.map((a) => ({
      id: a.id,
      eventId: a.eventId,
      memberId: a.memberId,
      rsvp: a.rsvp,
      member: {
        id: a.member.id,
        displayName: a.member.user.displayName,
        avatarUrl: a.member.user.avatarUrl,
        displayRole: a.member.displayRole,
      },
    })),
    reminders: e.reminders.map((r) => ({
      id: r.id,
      eventId: r.eventId,
      minutesBefore: r.minutesBefore,
      deliveredAt: r.deliveredAt?.toISOString() ?? null,
    })),
  }));
}

/**
 * Fetches a single event by ID, ensuring it belongs to the family and isn't deleted.
 */
export async function getFamilyEvent(
  eventId: string,
  familyId: string,
): Promise<AgendaEvent | null> {
  const event = await prisma.calendarEvent.findFirst({
    where: { id: eventId, familyId, deletedAt: null },
    include: {
      category: true,
      attendees: {
        include: {
          member: {
            select: {
              id: true,
              user: { select: { displayName: true, avatarUrl: true } },
              displayRole: true,
            },
          },
        },
      },
      reminders: true,
    },
  });

  if (!event) return null;

  return {
    id: event.id,
    familyId: event.familyId,
    categoryId: event.categoryId,
    title: event.title,
    description: event.description,
    location: event.location,
    videoCallLink: event.videoCallLink,
    startAt: event.startAt.toISOString(),
    endAt: event.endAt.toISOString(),
    allDay: event.allDay,
    visibility: event.visibility,
    recurrenceRule: event.recurrenceRule,
    createdByMemberId: event.createdByMemberId,
    updatedByMemberId: event.updatedByMemberId,
    deletedAt: event.deletedAt?.toISOString() ?? null,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
    category: event.category
      ? { id: event.category.id, familyId: event.category.familyId, name: event.category.name, color: event.category.color }
      : null,
    attendees: event.attendees.map((a) => ({
      id: a.id,
      eventId: a.eventId,
      memberId: a.memberId,
      rsvp: a.rsvp,
      member: {
        id: a.member.id,
        displayName: a.member.user.displayName,
        avatarUrl: a.member.user.avatarUrl,
        displayRole: a.member.displayRole,
      },
    })),
    reminders: event.reminders.map((r) => ({
      id: r.id,
      eventId: r.eventId,
      minutesBefore: r.minutesBefore,
      deliveredAt: r.deliveredAt?.toISOString() ?? null,
    })),
  };
}

/**
 * Fetches all event categories for a family.
 */
export async function listFamilyEventCategories(familyId: string): Promise<AgendaEventCategory[]> {
  const categories = await prisma.eventCategory.findMany({
    where: { familyId },
    orderBy: { name: "asc" },
  });

  return categories.map((c) => ({
    id: c.id,
    familyId: c.familyId,
    name: c.name,
    color: c.color,
  }));
}

/**
 * Fetches all family members who can be attendees (ACTIVE status).
 */
export async function listFamilyMembersForAgenda(familyId: string): Promise<AgendaMember[]> {
  const members = await prisma.familyMember.findMany({
    where: { familyId, status: "ACTIVE" },
    include: {
      user: { select: { displayName: true, avatarUrl: true } },
    },
    orderBy: { user: { displayName: "asc" } },
  });

  return members.map((m) => ({
    id: m.id,
    displayName: m.user.displayName,
    avatarUrl: m.user.avatarUrl,
    displayRole: m.displayRole,
  }));
}

/**
 * Creates a new event category.
 */
export async function createEventCategory(
  familyId: string,
  name: string,
  color: string = "#4285F4",
): Promise<AgendaEventCategory> {
  const category = await prisma.eventCategory.create({
    data: { familyId, name, color },
  });

  return { id: category.id, familyId: category.familyId, name: category.name, color: category.color };
}

/**
 * Updates an event category.
 */
export async function updateEventCategory(
  categoryId: string,
  familyId: string,
  data: { name?: string; color?: string },
): Promise<AgendaEventCategory> {
  const category = await prisma.eventCategory.update({
    where: { id: categoryId, familyId },
    data,
  });

  return { id: category.id, familyId: category.familyId, name: category.name, color: category.color };
}

/**
 * Deletes an event category (only if no events reference it).
 */
export async function deleteEventCategory(categoryId: string, familyId: string): Promise<void> {
  await prisma.eventCategory.delete({ where: { id: categoryId, familyId } });
}