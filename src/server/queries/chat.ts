import "server-only";

import { prisma } from "@/lib/prisma/client";
import { getDisplayRole } from "@/lib/authorization/roles";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const MESSAGE_PAGE_SIZE = 50;
const ATTACHMENT_URL_TTL_SECONDS = 60 * 60; // 1 hour

/**
 * Returns (creating if needed) the family's single FAMILY_CHAT conversation,
 * and makes sure the given member is subscribed to it. Idempotent — safe to
 * call on every page load.
 */
export async function getOrCreateFamilyChatConversation(
  familyId: string,
  memberId: string,
): Promise<string> {
  let conversation = await prisma.conversation.findFirst({
    where: { familyId, type: "FAMILY_CHAT" },
    select: { id: true },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: { familyId, type: "FAMILY_CHAT", title: "Family Chat" },
      select: { id: true },
    });
  }

  await prisma.conversationMember.upsert({
    where: {
      conversationId_memberId: {
        conversationId: conversation.id,
        memberId,
      },
    },
    update: {},
    create: { conversationId: conversation.id, memberId },
  });

  return conversation.id;
}

/** Public-safe sender projection — never leaks internalRole (Hidden Admin masking). */
export type MessageSender = {
  memberId: string;
  displayName: string;
  avatarUrl: string | null;
};

export type ChatAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  category: string;
  caption: string | null;
  /**
   * Short-lived signed URL (1h). Not cached beyond the request that fetched
   * it — a long-open tab may see a stale link after expiry, which is a known
   * v1 limitation (the same class of trade-off as any signed-URL chat app);
   * refreshing on demand is a reasonable follow-up, not a correctness bug.
   */
  url: string | null;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  body: string;
  type: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  sender: MessageSender | null;
  replyTo: { id: string; body: string; sender: MessageSender | null } | null;
  reactions: { emoji: string; count: number; reactedByMe: boolean; members: MessageSender[] }[];
  isPinned: boolean;
  isSavedByMe: boolean;
  isMine: boolean;
  attachments: ChatAttachment[];
  voiceDurationMs: number | null;
};

function toSender(
  member: { id: string; displayRole: string; user: { displayName: string; avatarUrl: string | null } } | null,
): MessageSender | null {
  if (!member) return null;
  return {
    memberId: member.id,
    displayName: member.user.displayName,
    avatarUrl: member.user.avatarUrl,
  };
}

function senderInclude() {
  return {
    sender: {
      select: {
        id: true,
        displayRole: true,
        user: { select: { displayName: true, avatarUrl: true } },
      },
    },
    replyTo: {
      include: {
        sender: {
          select: {
            id: true,
            displayRole: true,
            user: { select: { displayName: true, avatarUrl: true } },
          },
        },
      },
    },
    attachments: { include: { blob: true } },
  };
}

/** Reaction rows joined with a public-safe member profile (never internalRole). */
function reactionInclude() {
  return {
    reactions: {
      include: {
        member: {
          select: {
            id: true,
            displayRole: true,
            user: { select: { displayName: true, avatarUrl: true } },
          },
        },
      },
    },
  };
}

type SenderFlat = {
  id: string;
  displayRole: string;
  user: { displayName: string; avatarUrl: string | null };
};

/**
 * Structural shape produced by senderInclude() + reactions + pinnedMessage +
 * savedMessages, written out explicitly rather than derived generically from
 * a Prisma method call (which needs the generated client's types to resolve
 * correctly — this way projectMessage/signAttachmentUrls typecheck on their
 * own regardless of that).
 */
type MessageRelationRow = {
  id: string;
  conversationId: string;
  senderMemberId: string | null;
  type: string;
  body: string;
  metadata: unknown;
  editedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  sender: {
    id: string;
    displayRole: string;
    user: { displayName: string; avatarUrl: string | null };
  } | null;
  replyTo: {
    id: string;
    body: string;
    deletedAt: Date | null;
    sender: {
      id: string;
      displayRole: string;
      user: { displayName: string; avatarUrl: string | null };
    } | null;
  } | null;
  attachments: {
    id: string;
    caption: string | null;
    blob: {
      storagePath: string;
      fileName: string;
      mimeType: string;
      size: number;
      category: string;
    };
  }[];
  reactions: { emoji: string; memberId: string; member: SenderFlat }[];
  pinnedMessage: unknown;
  savedMessages: { id: string }[];
};

function buildInclude(viewerMemberId: string) {
  return {
    ...senderInclude(),
    ...reactionInclude(),
    pinnedMessage: true,
    savedMessages: { where: { memberId: viewerMemberId }, select: { id: true } },
  };
}

/** Mints signed URLs (batched, one request) for every attachment across a page of messages. */
async function signAttachmentUrls(
  rows: MessageRelationRow[],
): Promise<Map<string, string>> {
  const paths = rows.flatMap((row) => row.attachments.map((a) => a.blob.storagePath));
  const map = new Map<string, string>();
  if (paths.length === 0) return map;

  try {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.storage
      .from("families")
      .createSignedUrls(paths, ATTACHMENT_URL_TTL_SECONDS);
    if (error || !data) return map;
    for (const entry of data) {
      if (entry.path && entry.signedUrl) map.set(entry.path, entry.signedUrl);
    }
  } catch {
    // Supabase not configured (e.g. local dev) — attachments just render
    // without a resolvable URL rather than crashing the page.
  }
  return map;
}

function projectMessage(
  row: MessageRelationRow,
  viewerMemberId: string,
  signedUrls: Map<string, string>,
): ChatMessage {
  const reactionMap = new Map<string, { count: number; reactedByMe: boolean; members: MessageSender[] }>();
  for (const reaction of row.reactions) {
    const entry = reactionMap.get(reaction.emoji) ?? { count: 0, reactedByMe: false, members: [] };
    entry.count += 1;
    const member = toSender(reaction.member);
    if (member) entry.members.push(member);
    if (reaction.memberId === viewerMemberId) entry.reactedByMe = true;
    reactionMap.set(reaction.emoji, entry);
  }

  const metadata = row.metadata as { durationMs?: number } | null;

  return {
    id: row.id,
    conversationId: row.conversationId,
    body: row.deletedAt ? "" : row.body,
    type: row.type,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt ? row.editedAt.toISOString() : null,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    sender: toSender(row.sender),
    replyTo: row.replyTo
      ? {
          id: row.replyTo.id,
          body: row.replyTo.deletedAt ? "" : row.replyTo.body,
          sender: toSender(row.replyTo.sender),
        }
      : null,
    reactions: [...reactionMap.entries()].map(([emoji, v]) => ({
      emoji,
      count: v.count,
      reactedByMe: v.reactedByMe,
      members: v.members,
    })),
    isPinned: Boolean(row.pinnedMessage),
    isSavedByMe: row.savedMessages.length > 0,
    isMine: row.senderMemberId === viewerMemberId,
    attachments: row.deletedAt
      ? []
      : row.attachments.map((a) => ({
          id: a.id,
          fileName: a.blob.fileName,
          mimeType: a.blob.mimeType,
          size: a.blob.size,
          category: a.blob.category,
          caption: a.caption,
          url: signedUrls.get(a.blob.storagePath) ?? null,
        })),
    voiceDurationMs: metadata?.durationMs ?? null,
  } satisfies ChatMessage;
}

export type ChatMemberProfile = {
  memberId: string;
  displayName: string;
  avatarUrl: string | null;
};

/** Public-safe profile for one member (used for typing presence). */
export async function getMemberProfile(memberId: string): Promise<ChatMemberProfile | null> {
  const member = await prisma.familyMember.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      user: { select: { displayName: true, avatarUrl: true } },
    },
  });
  if (!member) return null;
  return {
    memberId: member.id,
    displayName: member.user.displayName,
    avatarUrl: member.user.avatarUrl,
  };
}

/** Lists the most recent messages in a conversation, oldest first. */
export async function listFamilyMessages(
  conversationId: string,
  viewerMemberId: string,
): Promise<ChatMessage[]> {
  const rows = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: MESSAGE_PAGE_SIZE,
    include: buildInclude(viewerMemberId),
  });

  const ordered = rows.reverse();
  const signedUrls = await signAttachmentUrls(ordered);
  return ordered.map((row) => projectMessage(row, viewerMemberId, signedUrls));
}

/** Lists pinned messages in a conversation, most recently pinned first. */
export async function listPinnedMessages(
  conversationId: string,
  viewerMemberId: string,
): Promise<ChatMessage[]> {
  const rows = await prisma.message.findMany({
    where: { conversationId, pinnedMessage: { isNot: null } },
    orderBy: { pinnedMessage: { createdAt: "desc" } },
    include: buildInclude(viewerMemberId),
  });

  const signedUrls = await signAttachmentUrls(rows);
  return rows.map((row) => projectMessage(row, viewerMemberId, signedUrls));
}

/** Fetches and projects a single message the same way listFamilyMessages does. */
export async function getFamilyMessage(
  messageId: string,
  viewerMemberId: string,
): Promise<ChatMessage | null> {
  const row = await prisma.message.findUnique({
    where: { id: messageId },
    include: buildInclude(viewerMemberId),
  });
  if (!row) return null;

  const signedUrls = await signAttachmentUrls([row]);
  return projectMessage(row, viewerMemberId, signedUrls);
}

/** displayRole helper re-export kept local so query callers don't reach into roles.ts unnecessarily. */
export { getDisplayRole };