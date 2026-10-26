import { NextRequest, NextResponse } from "next/server";
import { withNativeAuth } from "@/lib/auth/native-context";
import { getAccessState } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma/client";
import { env } from "@/lib/env";
import { modules, type ModuleKey } from "@/lib/workspace";
import { requireAccess } from "@/server/workspace-access";
import { resolveEffectivePermissions } from "@/lib/authorization/authorization";
import { loadWorkspace } from "@/server/queries/workspace";
import {
  saveWorkspaceItem,
  deleteWorkspaceItem,
  voteInPoll,
} from "@/server/actions/workspace";
import { preferenceSections } from "@/lib/preferences";
import { preferencesForUser } from "@/server/queries/preferences";
import {
  saveProfile,
  savePreferences,
  markNotificationsRead,
} from "@/server/actions/account";
import {
  createDirectConversation,
  sendDirectMessage,
} from "@/server/actions/dms";
import {
  fetchAgendaRange,
  createAgendaEvent,
  updateAgendaEvent,
  deleteAgendaEvent,
  updateRsvp,
} from "@/server/actions/agenda";
import {
  fetchEventDetails,
  changeEventDetails,
} from "@/server/actions/event-details";
import {
  fetchNoteHistory,
  restoreNoteVersion,
} from "@/server/actions/notebook";
import {
  getOrCreateFamilyChatConversation,
  listFamilyMessages,
  listPinnedMessages,
  listSavedMessages,
} from "@/server/queries/chat";
import {
  finalizeChatMessage,
  createUploadStaging,
} from "@/server/actions/attachments";
import {
  editFamilyMessage,
  deleteFamilyMessage,
  toggleMessageReaction,
  togglePinMessage,
  toggleSaveMessage,
} from "@/server/actions/chat";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { z } from "zod";
import { mobileAdmin, mobileSearch } from "@/server/queries/mobile";
import { administer } from "@/server/actions/admin";
import {
  listFamilyEventCategories,
  listFamilyMembersForAgenda,
} from "@/server/queries/agenda";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
function kindOf(value: string): ModuleKey {
  if (!Object.hasOwn(modules, value)) throw new Error("Unknown tool.");
  return value as ModuleKey;
}
const objectForm = (value: Record<string, unknown> = {}) => {
  const form = new FormData();
  for (const [key, item] of Object.entries(value))
    if (item != null) form.set(key, String(item));
  return form;
};
class PayloadTooLarge extends Error {}
// Keep native multipart requests below the hosting platform's 4.5 MB limit.
// Enforce the bound while streaming too, including requests without Content-Length.
async function boundedBody(request: NextRequest) {
  const max = 4 * 1024 * 1024 + 64 * 1024;
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new PayloadTooLarge();
    }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
async function formBody(request: NextRequest) {
  return new Response(await boundedBody(request), {
    headers: { "Content-Type": request.headers.get("content-type") ?? "" },
  }).formData();
}
async function jsonBody(request: NextRequest): Promise<unknown> {
  return JSON.parse(new TextDecoder().decode(await boundedBody(request)));
}
async function handle(request: NextRequest, context: Context) {
  const { path } = await context.params;
  if (request.method === "GET" && path.join("/") === "config")
    return json({
      supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
      supabaseKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    });
  const bearer = request.headers
    .get("authorization")
    ?.match(/^Bearer (\S+)$/i)?.[1];
  if (!bearer || bearer.length > 8192)
    return json({ error: "Sign in to Famora." }, 401);
  if (
    Number(request.headers.get("content-length") ?? 0) >
    4 * 1024 * 1024 + 64 * 1024
  )
    return json({ error: "Choose a file smaller than 4 MB." }, 413);
  return withNativeAuth(bearer, async () => {
    try {
      const access = await getAccessState();
      if (access.status !== "authorized")
        return json(
          {
            error:
              access.status === "denied"
                ? "This account does not have family access."
                : "Your session has expired.",
          },
          access.status === "denied" ? 403 : 401,
        );
      const [resource, id, detail] = path;
      if (request.method === "GET") {
        if (resource === "session") {
          const [user, family, features, preferences] = await Promise.all([
            prisma.user.findUnique({
              where: { id: access.user.id },
              select: {
                id: true,
                displayName: true,
                email: true,
                avatarUrl: true,
                birthday: true,
                phone: true,
                bio: true,
                timezone: true,
                language: true,
              },
            }),
            prisma.family.findUnique({
              where: { id: access.familyId },
              select: { id: true, name: true },
            }),
            prisma.familyFeature.findMany({
              where: { familyId: access.familyId },
              select: { key: true, enabled: true },
            }),
            preferencesForUser(access.user.id),
          ]);
          const permissions = [
            ...resolveEffectivePermissions(access.membership),
          ];
          return json({
            user,
            family,
            memberId: access.memberId,
            role: access.displayRole,
            permissions,
            preferences,
            preferenceSections,
            modules: Object.fromEntries(
              Object.entries(modules).filter(
                ([, m]) =>
                  permissions.includes(m.read) &&
                  features.find((f) => f.key === m.feature)?.enabled !== false,
              ),
            ),
            features,
          });
        }
        if (resource === "workspace")
          return json({
            ...(await loadWorkspace(kindOf(id))),
            config: modules[kindOf(id)],
          });
        if (resource === "search")
          return json(
            await mobileSearch(request.nextUrl.searchParams.get("q") ?? ""),
          );
        if (resource === "admin")
          return json(await mobileAdmin(id || "overview"));
        if (resource === "agenda-meta") {
          await requireAccess("agenda.read", "agenda");
          const [categories, members] = await Promise.all([
            listFamilyEventCategories(access.familyId),
            listFamilyMembersForAgenda(access.familyId),
          ]);
          return json({ categories, members });
        }
        if (resource === "history")
          return json(await fetchNoteHistory(id, detail === "personal"));
        if (resource === "agenda")
          return json(
            await fetchAgendaRange(
              request.nextUrl.searchParams.get("start") ??
                new Date().toISOString(),
              request.nextUrl.searchParams.get("end") ??
                new Date(Date.now() + 31 * 86400000).toISOString(),
            ),
          );
        if (resource === "event") return json(await fetchEventDetails(id));
        if (resource === "chat") {
          await requireAccess("chat.read", "chat");
          const settings = await prisma.familySettings.findUnique({
            where: { familyId: access.familyId },
          });
          if (settings?.chatEnabled === false)
            return json({ error: "Family chat is disabled." }, 403);
          const conversationId = await getOrCreateFamilyChatConversation(
            access.familyId,
            access.memberId,
          );
          const [messages, pinnedMessages, savedMessages] = await Promise.all([
            listFamilyMessages(conversationId, access.memberId),
            listPinnedMessages(conversationId, access.memberId),
            listSavedMessages(conversationId, access.memberId),
          ]);
          return json({
            conversationId,
            messages,
            pinnedMessages,
            savedMessages,
          });
        }
        if (resource === "dms") {
          await requireAccess("dms.read", "dms");
          const conversations = await prisma.conversation.findMany({
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
                  member: {
                    select: { user: { select: { displayName: true } } },
                  },
                },
              },
            },
            orderBy: { updatedAt: "desc" },
          });
          const active = id && conversations.find((c) => c.id === id);
          if (id && !active)
            return json({ error: "Conversation not available." }, 404);
          const messages = active
            ? await prisma.message.findMany({
                where: { conversationId: id, deletedAt: null },
                select: {
                  id: true,
                  body: true,
                  createdAt: true,
                  senderMemberId: true,
                  sender: {
                    select: { user: { select: { displayName: true } } },
                  },
                },
                orderBy: { createdAt: "desc" },
                take: 100,
              })
            : [];
          const members = await prisma.familyMember.findMany({
            where: {
              familyId: access.familyId,
              status: "ACTIVE",
              internalRole: { not: "HIDDEN_ADMIN" },
              id: { not: access.memberId },
            },
            select: { id: true, user: { select: { displayName: true } } },
          });
          if (
            active &&
            access.internalRole !== "HIDDEN_ADMIN" &&
            (await preferencesForUser(access.user.id)).privacy?.readReceipts !==
              false
          ) {
            await prisma.conversationMember.updateMany({
              where: { conversationId: id, memberId: access.memberId },
              data: { lastReadAt: new Date() },
            });
          }
          return json({ conversations, messages: messages.reverse(), members });
        }
        if (resource === "notifications") {
          await requireAccess("notifications.read");
          return json(
            await prisma.notification.findMany({
              where: { familyId: access.familyId, userId: access.user.id },
              select: {
                id: true,
                title: true,
                body: true,
                link: true,
                createdAt: true,
                readAt: true,
              },
              orderBy: { createdAt: "desc" },
              take: 100,
            }),
          );
        }
        if (resource === "members") {
          await requireAccess("members.read");
          return json(
            await prisma.familyMember.findMany({
              where: {
                familyId: access.familyId,
                status: "ACTIVE",
                internalRole: { not: "HIDDEN_ADMIN" },
              },
              select: {
                id: true,
                displayRole: true,
                user: { select: { displayName: true, avatarUrl: true } },
              },
            }),
          );
        }
      } else if (request.method === "DELETE" && resource === "workspace") {
        return json(
          await deleteWorkspaceItem(
            kindOf(id),
            z.string().uuid().parse(detail),
          ),
        );
      } else if (request.method === "POST") {
        if (resource === "admin")
          return json(await administer(id, await formBody(request)));
        if (resource === "workspace")
          return json(
            await saveWorkspaceItem(
              kindOf(id),
              detail ? z.string().uuid().parse(detail) : null,
              await formBody(request),
            ),
          );
        if (resource === "profile")
          return json(await saveProfile(await formBody(request)));
        if (resource === "preferences")
          return json(await savePreferences(id, await formBody(request)));
        if (resource === "chat-upload") {
          const form = await formBody(request);
          const file = form.get("file");
          if (!(file instanceof File) || file.size > 4 * 1024 * 1024)
            return json({ error: "Choose a file smaller than 4 MB." }, 400);
          const voice = form.get("voice") === "true";
          const staged = await createUploadStaging(
            file.name,
            voice ? "VOICE" : "ATTACHMENT",
          );
          if (!staged.ok) return json(staged, 400);
          const uploaded = await (
            await getSupabaseServerClient()
          ).storage
            .from("families")
            .upload(
              staged.data.path,
              new Uint8Array(await file.arrayBuffer()),
              { contentType: file.type },
            );
          if (uploaded.error) return json({ error: "Upload failed." }, 400);
          return json({ path: staged.data.path, fileName: file.name });
        }
        if (resource === "action") {
          const input = z
            .object({
              action: z.string(),
              id: z.string().optional(),
              value: z.string().optional(),
              data: z.record(z.string(), z.unknown()).optional(),
            })
            .parse(await jsonBody(request));
          const { action, data = {}, value = "" } = input;
          const target = input.id ?? "";
          let result: unknown;
          switch (action) {
            case "vote":
              result = await voteInPoll(target, value);
              break;
            case "event-create":
              result = await createAgendaEvent(data);
              break;
            case "event-update":
              result = await updateAgendaEvent(target, data);
              break;
            case "event-delete":
              result = await deleteAgendaEvent(target);
              break;
            case "event-detail":
              result = await changeEventDetails(
                target,
                value,
                objectForm(data),
              );
              break;
            case "rsvp":
              result = await updateRsvp(
                target,
                z.enum(["NONE", "YES", "NO", "MAYBE"]).parse(value),
              );
              break;
            case "dm-start":
              result = await createDirectConversation(target);
              break;
            case "dm-send":
              result = await sendDirectMessage(target, objectForm(data));
              break;
            case "chat-send":
              result = await finalizeChatMessage(data);
              break;
            case "chat-edit":
              result = await editFamilyMessage(target, value);
              break;
            case "chat-delete":
              result = await deleteFamilyMessage(target);
              break;
            case "chat-react":
              result = await toggleMessageReaction(target, value);
              break;
            case "chat-pin":
              result = await togglePinMessage(target);
              break;
            case "chat-save":
              result = await toggleSaveMessage(target);
              break;
            case "notifications-read":
              result = await markNotificationsRead(target || undefined);
              break;
            case "note-restore":
              result = await restoreNoteVersion(
                target,
                value,
                data.personal === true,
              );
              break;
            default:
              return json({ error: "Unknown action." }, 400);
          }
          return json(result ?? { success: true });
        }
      }
      return json({ error: "Not found." }, 404);
    } catch (error) {
      if (error instanceof PayloadTooLarge)
        return json({ error: "Choose a file smaller than 4 MB." }, 413);
      if (error instanceof SyntaxError)
        return json({ error: "Invalid JSON request." }, 400);
      if (error instanceof z.ZodError)
        return json(
          { error: error.issues[0]?.message ?? "Invalid request." },
          400,
        );
      const message = error instanceof Error ? error.message : "";
      if (/permission|disabled|not available|not found/i.test(message))
        return json({ error: message }, 403);
      console.error("Mobile API request failed", request.method, path[0]);
      return json(
        { error: "Could not complete this request. Please try again." },
        500,
      );
    }
  });
}
export { handle as GET, handle as POST, handle as DELETE };
