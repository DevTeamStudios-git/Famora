import "server-only";
import type { Prisma } from "@/generated/prisma/client";
export async function notifyFamily(
  tx: Prisma.TransactionClient,
  input: {
    familyId: string;
    actorUserId: string;
    memberIds?: string[];
    category: string;
    title: string;
    body?: string;
    link: string;
  },
) {
  const members = await tx.familyMember.findMany({
    where: {
      familyId: input.familyId,
      status: "ACTIVE",
      userId: { not: input.actorUserId },
      ...(input.memberIds ? { id: { in: input.memberIds } } : {}),
    },
    select: { userId: true },
  });
  for (const member of members ?? []) {
    const preference = await tx.userNotificationPreference.findFirst({
      where: {
        userId: member.userId,
        familyId: input.familyId,
        category: input.category,
        channel: "IN_APP",
      },
    });
    if (preference?.enabled === false) continue;
    await tx.notification.create({
      data: {
        familyId: input.familyId,
        userId: member.userId,
        type: input.category,
        title: input.title,
        body: input.body,
        link: input.link,
      },
    });
  }
}
