"use server";
import { z } from "zod";
import { prisma } from "@/lib/prisma/client";
import { requireAccess } from "@/server/workspace-access";
import { hasPermission } from "@/lib/authorization/authorization";
import { revalidatePath } from "next/cache";
import type { FormResult } from "@/components/core/action-form";

async function requireEvent(id: string) {
  z.string().uuid().parse(id);
  const access = await requireAccess("agenda.read", "agenda");
  const event = await prisma.calendarEvent.findFirst({
    where: {
      id,
      familyId: access.familyId,
      deletedAt: null,
      OR: [
        { visibility: "FAMILY" },
        { createdByMemberId: access.memberId },
        { attendees: { some: { memberId: access.memberId } } },
      ],
    },
    select: { id: true, createdByMemberId: true },
  });
  if (!event) throw new Error("Event not found.");
  return { access, event };
}
export async function fetchEventDetails(id: string) {
  const { access } = await requireEvent(id);
  const [comments, checklist, attachments, files] = await Promise.all([
    prisma.calendarEventComment.findMany({
      where: { eventId: id, deletedAt: null },
      select: {
        id: true,
        body: true,
        createdAt: true,
        author: { select: { user: { select: { displayName: true } } } },
      },
      orderBy: { createdAt: "asc" },
      take: 100,
    }),
    prisma.calendarEventChecklistItem.findMany({
      where: { eventId: id },
      select: { id: true, label: true, isDone: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.calendarEventAttachment.findMany({
      where: { eventId: id },
      select: { id: true, fileId: true },
    }),
    hasPermission(access.membership, "files.read")
      ? prisma.file.findMany({
          where: { familyId: access.familyId, deletedAt: null },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
          take: 200,
        })
      : [],
  ]);
  return {
    comments: comments.map((c) => ({
      id: c.id,
      body: c.body,
      author: c.author.user.displayName,
      date: c.createdAt.toISOString(),
    })),
    checklist,
    attachments: attachments.flatMap((a) => {
      const file = files.find((f) => f.id === a.fileId);
      return file ? [{ id: a.id, name: file.name }] : [];
    }),
    files,
  };
}
export async function changeEventDetails(
  id: string,
  operation: string,
  form: FormData,
): Promise<FormResult> {
  try {
    const { access, event } = await requireEvent(id);
    const text = (key: string) => String(form.get(key) ?? "").trim();
    const canEdit =
      hasPermission(access.membership, "agenda.event.update.any") ||
      (event.createdByMemberId === access.memberId &&
        hasPermission(access.membership, "agenda.event.update.own"));
    if (operation === "comment") {
      if (!hasPermission(access.membership, "agenda.event.comment"))
        return { error: "You cannot comment on events." };
      const body = z.string().min(1).max(5000).parse(text("body"));
      await prisma.calendarEventComment.create({
        data: { eventId: id, authorId: access.memberId, body },
      });
    } else {
      if (!canEdit)
        return {
          error:
            "Only the event owner or an event manager can edit this checklist and its attachments.",
        };
      if (operation === "checklist") {
        const label = z.string().min(1).max(200).parse(text("label"));
        await prisma.calendarEventChecklistItem.create({
          data: { eventId: id, label },
        });
      } else if (operation === "toggle") {
        const itemId = z.string().uuid().parse(text("itemId"));
        const isDone =
          z.enum(["true", "false"]).parse(text("isDone")) === "true";
        await prisma.calendarEventChecklistItem.update({
          where: { id: itemId, eventId: id },
          data: {
            isDone,
            completedById: isDone ? access.memberId : null,
            completedAt: isDone ? new Date() : null,
          },
        });
      } else if (operation === "attach") {
        if (!hasPermission(access.membership, "files.read"))
          return { error: "You cannot access family files." };
        const fileId = z.string().uuid().parse(text("fileId"));
        const file = await prisma.file.findFirst({
          where: { id: fileId, familyId: access.familyId, deletedAt: null },
        });
        if (!file) return { error: "File not found." };
        if (
          !(await prisma.calendarEventAttachment.findFirst({
            where: { eventId: id, fileId },
          }))
        )
          await prisma.calendarEventAttachment.create({
            data: { eventId: id, fileId, addedById: access.memberId },
          });
      } else if (operation === "detach") {
        const attachmentId = z.string().uuid().parse(text("attachmentId"));
        await prisma.calendarEventAttachment.deleteMany({
          where: { id: attachmentId, eventId: id },
        });
      } else return { error: "Unknown operation." };
    }
    revalidatePath("/agenda");
    return { success: "Saved." };
  } catch (error) {
    if (error instanceof z.ZodError)
      return { error: error.issues[0]?.message ?? "Invalid input." };
    return {
      error:
        "Could not save this event detail. Check your access and try again.",
    };
  }
}
