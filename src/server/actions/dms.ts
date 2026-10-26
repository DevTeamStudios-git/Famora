"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import { requireAccess } from "@/server/workspace-access";
import type { FormResult } from "@/components/core/action-form";

export async function startDirectMessage(form: FormData): Promise<FormResult> {
  const result = await createDirectConversation(String(form.get("memberId") ?? ""));
  if ("error" in result) return result;
  redirect(`/dms?conversation=${result.id}`);
}

export async function createDirectConversation(rawMemberId: string): Promise<{ id: string } | { error: string }> {
  const access = await requireAccess("dms.send", "dms");
  const parsed = z.string().uuid().safeParse(rawMemberId);
  if (!parsed.success || parsed.data === access.memberId)
    return { error: "Choose another family member." };
  const memberId = parsed.data;
  const target = await prisma.familyMember.findFirst({
    where: {
      id: memberId,
      familyId: access.familyId,
      status: "ACTIVE",
      internalRole: { not: "HIDDEN_ADMIN" },
    },
  });
  if (!target) return { error: "Member not available." };
  const conversation =
    (await prisma.conversation.findFirst({
      where: {
        familyId: access.familyId,
        type: "DM",
        AND: [
          { members: { some: { memberId: access.memberId } } },
          { members: { some: { memberId } } },
          {
            members: {
              every: { memberId: { in: [memberId, access.memberId] } },
            },
          },
        ],
      },
    })) ??
    (await prisma.conversation.create({
      data: {
        familyId: access.familyId,
        type: "DM",
        members: { create: [{ memberId: access.memberId }, { memberId }] },
      },
    }));
  return { id: conversation.id };
}

export async function sendDirectMessage(
  conversationId: string,
  form: FormData,
): Promise<FormResult> {
  const access = await requireAccess("dms.send", "dms");
  const parsed = z
    .object({
      id: z.string().uuid(),
      body: z.string().trim().min(1).max(10000),
    })
    .safeParse({ id: conversationId, body: form.get("body") });
  if (!parsed.success)
    return { error: "Enter a message (up to 10,000 characters)." };
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      familyId: access.familyId,
      type: "DM",
      members: { some: { memberId: access.memberId } },
    },
    include: {
      members: {
        select: { member: { select: { userId: true, status: true } } },
      },
    },
  });
  if (
    !conversation ||
    conversation.members.some((m) => m.member.status !== "ACTIVE")
  )
    return { error: "Conversation is not available." };
  await prisma.$transaction(async (tx) => {
    await tx.message.create({
      data: {
        conversationId,
        senderMemberId: access.memberId,
        body: parsed.data.body,
      },
    });
    await tx.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
    for (const recipient of conversation.members.filter(
      (m) => m.member.userId !== access.user.id,
    )) {
      const pref = await tx.userNotificationPreference.findFirst({
        where: {
          userId: recipient.member.userId,
          familyId: access.familyId,
          category: "dms",
          channel: "IN_APP",
        },
      });
      if (pref?.enabled !== false)
        await tx.notification.create({
          data: {
            familyId: access.familyId,
            userId: recipient.member.userId,
            type: "NEW_DM",
            title: "New direct message",
            link: `/dms?conversation=${conversationId}`,
          },
        });
    }
  });
  revalidatePath("/dms");
  return { success: "Message sent." };
}
