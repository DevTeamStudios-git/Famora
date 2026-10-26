import Link from "next/link";
import { requireAccess } from "@/server/workspace-access";
import { prisma } from "@/lib/prisma/client";
import { ActionForm } from "@/components/core/action-form";
import { startDirectMessage, sendDirectMessage } from "@/server/actions/dms";
import { Textarea } from "@/components/ui/textarea";
import { Refresh } from "@/components/core/refresh";
import { preferencesForUser } from "@/server/queries/preferences";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ conversation?: string }>;
}) {
  const access = await requireAccess("dms.read", "dms");
  const { conversation: selected } = await searchParams;
  const preferences = await preferencesForUser(access.user.id);
  const [conversations, members] = await Promise.all([
    prisma.conversation.findMany({
      where: {
        familyId: access.familyId,
        type: "DM",
        members: { some: { memberId: access.memberId } },
      },
      select: {
        id: true,
        members: {
          select: {
            memberId: true,
            lastReadAt: true,
            member: { select: { user: { select: { displayName: true } } } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.familyMember.findMany({
      where: {
        familyId: access.familyId,
        status: "ACTIVE",
        id: { not: access.memberId },
        internalRole: { not: "HIDDEN_ADMIN" },
      },
      select: { id: true, user: { select: { displayName: true } } },
    }),
  ]);
  const active =
    conversations.find((c) => c.id === selected) ??
    (selected ? null : conversations[0]);
  const messages = active
    ? await prisma.message.findMany({
        where: { conversationId: active.id, deletedAt: null },
        select: {
          id: true,
          body: true,
          createdAt: true,
          senderMemberId: true,
          sender: { select: { user: { select: { displayName: true } } } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      })
    : [];
  if (
    active &&
    preferences.privacy?.readReceipts !== false &&
    access.internalRole !== "HIDDEN_ADMIN"
  )
    await prisma.conversationMember.updateMany({
      where: { conversationId: active.id, memberId: access.memberId },
      data: { lastReadAt: new Date() },
    });
  return (
    <div className="space-y-5">
      <Refresh />
      <h1 className="text-2xl font-semibold">Direct Messages</h1>
      <div className="grid gap-6 md:grid-cols-[240px_1fr]">
        <aside className="space-y-5">
          <ActionForm action={startDirectMessage} submit="Start conversation">
            <label htmlFor="dm-member" className="text-sm">
              Family member
            </label>
            <select
              name="memberId"
              id="dm-member"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              required
            >
              <option value="">Choose a member</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.user.displayName}
                </option>
              ))}
            </select>
          </ActionForm>
          <nav aria-label="Conversations" className="space-y-2">
            {conversations.map((c) => (
              <Link
                key={c.id}
                href={`/dms?conversation=${c.id}`}
                className={`block rounded-lg border p-3 text-sm ${active?.id === c.id ? "bg-accent" : ""}`}
              >
                {c.members
                  .filter((m) => m.memberId !== access.memberId)
                  .map((m) => m.member.user.displayName)
                  .join(", ")}
              </Link>
            ))}
          </nav>
        </aside>
        <section className="space-y-4">
          {active ? (
            <>
              <h2 className="font-semibold">
                {active.members
                  .filter((m) => m.memberId !== access.memberId)
                  .map((m) => m.member.user.displayName)
                  .join(", ")}
              </h2>
              <div className="max-h-[55vh] space-y-3 overflow-y-auto rounded-xl border p-4">
                {messages.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Send the first message.
                  </p>
                )}
                {messages.reverse().map((m) => (
                  <article
                    key={m.id}
                    className={`rounded-lg p-3 ${m.senderMemberId === access.memberId ? "ml-8 bg-accent" : "mr-8 bg-muted"}`}
                  >
                    <p className="text-xs text-muted-foreground">
                      {m.sender?.user.displayName ?? "Family member"} ·{" "}
                      {m.createdAt.toLocaleString()}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm">
                      {m.body}
                    </p>
                    {m.senderMemberId === access.memberId &&
                      active.members.some(
                        (member) =>
                          member.memberId !== access.memberId &&
                          member.lastReadAt &&
                          member.lastReadAt >= m.createdAt,
                      ) && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Read
                        </p>
                      )}
                  </article>
                ))}
              </div>
              <ActionForm
                key={active.id}
                action={sendDirectMessage.bind(null, active.id)}
                submit="Send message"
              >
                <label htmlFor="dm-body" className="sr-only">
                  Message
                </label>
                <Textarea
                  id="dm-body"
                  name="body"
                  required
                  maxLength={10000}
                  placeholder="Write a private message…"
                />
              </ActionForm>
            </>
          ) : (
            <p className="text-muted-foreground">
              Choose a conversation or start a new one.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
