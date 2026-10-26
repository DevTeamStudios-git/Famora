import "server-only";
import { prisma } from "@/lib/prisma/client";
import { hasPermission } from "@/lib/authorization/authorization";
import { requireAccess } from "@/server/workspace-access";
import {
  modules,
  documentText,
  type ModuleKey,
  type WorkspaceItem,
} from "@/lib/workspace";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { preferencesForUser } from "@/server/queries/preferences";
import { formatPreferredDate } from "@/lib/preferences";

export async function loadWorkspace(kind: ModuleKey) {
  const config = modules[kind];
  const access = await requireAccess(config.read, config.feature);
  const familyId = access.familyId;
  const preferences = await preferencesForUser(access.user.id);
  const scope = { familyId, deletedAt: null };
  const newest = { createdAt: "desc" as const };
  let items: WorkspaceItem[] = [];
  switch (kind) {
    case "tasks": {
      const rows = await prisma.task.findMany({
        where: scope,
        include: {
          assignments: {
            include: {
              member: { select: { user: { select: { displayName: true } } } },
            },
          },
        },
        orderBy: [{ status: "asc" }, { dueAt: "asc" }],
        take: 200,
      });
      items = rows.map((r) => ({
        id: r.id,
        title: r.title,
        body: r.description ?? "",
        detail: [
          r.status.replaceAll("_", " "),
          r.priority,
          r.dueAt
            ? formatPreferredDate(
                r.dueAt,
                preferences.language?.dateFormat ?? "locale",
              )
            : null,
          ...r.assignments.map((a) => a.member.user.displayName),
        ]
          .filter(Boolean)
          .join(" · "),
        values: {
          title: r.title,
          description: r.description ?? "",
          status: r.status,
          priority: r.priority,
          dueAt: r.dueAt?.toISOString() ?? "",
          assigneeId: r.assignments[0]?.memberId ?? "",
        },
      }));
      break;
    }
    case "notebook":
    case "personal": {
      const rows = await prisma.notebookPage.findMany({
        where: {
          deletedAt: null,
          status: "ACTIVE",
          notebook:
            kind === "personal"
              ? { type: "PERSONAL", ownerId: access.user.id }
              : { type: "FAMILY", familyId },
        },
        orderBy: { updatedAt: "desc" },
        take: 200,
      });
      items = rows.map((r) => ({
        id: r.id,
        title: r.title,
        body: documentText(r.content),
        values: { title: r.title, body: documentText(r.content) },
      }));
      break;
    }
    case "contacts": {
      const rows = await prisma.familyContact.findMany({
        where: { familyId },
        orderBy: [{ isEmergency: "desc" }, { name: "asc" }],
        take: 200,
      });
      items = rows.map((r) => ({
        id: r.id,
        title: r.name,
        body: [r.phone, r.email, r.address, r.website, r.notes]
          .filter(Boolean)
          .join("\n"),
        detail: `${r.isEmergency ? "Emergency · " : ""}${r.category}`,
        values: {
          name: r.name,
          category: r.category,
          phone: r.phone ?? "",
          email: r.email ?? "",
          address: r.address ?? "",
          website: r.website ?? "",
          notes: r.notes ?? "",
          isEmergency: r.isEmergency,
        },
      }));
      break;
    }
    case "recipes": {
      const rows = await prisma.recipe.findMany({
        where: scope,
        orderBy: newest,
        take: 200,
      });
      items = rows.map((r) => {
        const ingredients = Array.isArray(r.ingredients)
          ? r.ingredients
              .map((i) => (typeof i === "string" ? i : documentText(i)))
              .join("\n")
          : "";
        return {
          id: r.id,
          title: r.title,
          body: `${ingredients}\n\n${documentText(r.instructions)}`,
          detail: `${(r.prepMinutes ?? 0) + (r.cookMinutes ?? 0)} minutes · ${r.servings ?? 1} servings`,
          values: {
            title: r.title,
            ingredients,
            body: documentText(r.instructions),
            prepMinutes: String(r.prepMinutes ?? ""),
            cookMinutes: String(r.cookMinutes ?? ""),
            servings: String(r.servings ?? ""),
          },
        };
      });
      break;
    }
    case "announcements": {
      const manage = hasPermission(access.membership, "announcements.manage");
      const now = new Date();
      const rows = await prisma.announcement.findMany({
        where: {
          ...scope,
          ...(manage
            ? {}
            : {
                AND: [
                  {
                    OR: [
                      { status: "PUBLISHED" },
                      { status: "SCHEDULED", scheduledFor: { lte: now } },
                    ],
                  },
                  { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
                ],
              }),
        },
        orderBy: newest,
        take: 200,
      });
      items = rows.map((r) => ({
        id: r.id,
        title: r.title,
        body: documentText(r.content),
        detail: `${r.priority} · ${r.status}`,
        values: {
          title: r.title,
          body: documentText(r.content),
          priority: r.priority,
          status: r.status,
          scheduledFor: r.scheduledFor?.toISOString() ?? "",
          expiresAt: r.expiresAt?.toISOString() ?? "",
        },
      }));
      break;
    }
    case "files": {
      const rows = await prisma.file.findMany({
        where: scope,
        include: { blob: true, folder: true },
        orderBy: newest,
        take: 200,
      });
      const storage = (await getSupabaseServerClient()).storage;
      items = await Promise.all(
        rows.map(async (r) => {
          const { data } = hasPermission(access.membership, "files.download")
            ? await storage
                .from(r.blob.bucket)
                .createSignedUrl(r.blob.storagePath, 300, { download: r.name })
            : { data: null };
          return {
            id: r.id,
            title: r.name,
            body: `${r.blob.mimeType} · ${Number(r.blob.size).toLocaleString()} bytes`,
            detail: r.folder?.name ?? "All files",
            url: data?.signedUrl,
            values: { name: r.name, folder: r.folder?.name ?? "" },
          };
        }),
      );
      break;
    }
    case "memories": {
      const rows = await prisma.memory.findMany({
        where: scope,
        include: { assets: { include: { blob: true } }, album: true },
        orderBy: newest,
        take: 200,
      });
      const storage = (await getSupabaseServerClient()).storage;
      items = await Promise.all(
        rows.map(async (r) => {
          const blob = r.assets[0]?.blob;
          const signed = blob
            ? await storage
                .from(blob.bucket)
                .createSignedUrl(blob.storagePath, 300)
            : null;
          return {
            id: r.id,
            title: r.caption ?? "Memory",
            body: r.takenAt
              ? formatPreferredDate(
                  r.takenAt,
                  preferences.language?.dateFormat ?? "locale",
                )
              : "",
            detail: r.album?.name,
            url: signed?.data?.signedUrl,
            mediaType: blob?.mimeType,
            values: {
              caption: r.caption ?? "",
              takenAt: r.takenAt?.toISOString().slice(0, 10) ?? "",
              album: r.album?.name ?? "",
            },
          };
        }),
      );
      break;
    }
    case "polls": {
      const rows = await prisma.poll.findMany({
        where: { familyId },
        include: {
          options: { include: { votes: { select: { memberId: true } } } },
        },
        orderBy: newest,
        take: 200,
      });
      items = rows.map((r) => ({
        id: r.id,
        title: r.question,
        body:
          r.status === "CLOSED" || (r.deadline && r.deadline <= new Date())
            ? "Voting closed"
            : "Choose an option to vote",
        detail: r.isAnonymous ? "Anonymous poll" : "Family poll",
        canEdit: false,
        canDelete: r.createdByMemberId === access.memberId,
        options: r.options.map((o) => ({
          id: o.id,
          label: o.label,
          votes: o.votes.length,
          mine: o.votes.some((v) => v.memberId === access.memberId),
        })),
        values: {
          question: r.question,
          options: r.options.map((o) => o.label).join("\n"),
          deadline: r.deadline?.toISOString() ?? "",
          isMultipleChoice: r.isMultipleChoice,
          isAnonymous: r.isAnonymous,
        },
      }));
      break;
    }
  }
  const sortSection =
    kind === "personal"
      ? "personal-notebook"
      : kind === "notebook"
        ? "family-notebook"
        : kind;
  if (["name", "title"].includes(String(preferences[sortSection]?.sort)))
    items.sort((a, b) => a.title.localeCompare(b.title));
  const members =
    kind === "tasks" && hasPermission(access.membership, "tasks.assign")
      ? await prisma.familyMember.findMany({
          where: {
            familyId,
            status: "ACTIVE",
            internalRole: { not: "HIDDEN_ADMIN" },
          },
          select: { id: true, user: { select: { displayName: true } } },
        })
      : [];
  return {
    items,
    members: members.map((m) => ({ id: m.id, name: m.user.displayName })),
    canCreate: hasPermission(access.membership, config.create),
    canEdit: hasPermission(access.membership, config.update),
    canDelete: hasPermission(access.membership, config.delete),
  };
}
