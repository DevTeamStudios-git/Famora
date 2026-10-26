"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { fileTypeFromBuffer } from "file-type";
import { prisma } from "@/lib/prisma/client";
import { requireAccess } from "@/server/workspace-access";
import { modules, textDocument, type ModuleKey } from "@/lib/workspace";
import {
  taskSchema,
  contactSchema,
  pollSchema,
  recipeSchema,
  memorySchema,
} from "@/lib/validation/schemas";
import { hasPermission } from "@/lib/authorization/authorization";
import {
  ALLOWED_MIME_TYPES,
  looksLikePlainText,
} from "@/lib/validation/attachments";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { FormResult } from "@/components/core/action-form";
import { notifyFamily } from "@/server/notifications";

const keySchema = z.enum([
  "tasks",
  "notebook",
  "personal",
  "contacts",
  "recipes",
  "announcements",
  "files",
  "memories",
  "polls",
]);
const titleSchema = z.string().trim().min(1, "Please enter a title.").max(200);
const bodySchema = z
  .string()
  .trim()
  .min(1, "Please enter some content.")
  .max(50000);
const optionalDate = (form: FormData, name: string) => {
  const raw = String(form.get(name) ?? "");
  if (!raw) return null;
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid date.");
  return date;
};
const value = (form: FormData, name: string) =>
  String(form.get(name) ?? "").trim();
const optional = (form: FormData, name: string) => value(form, name) || null;
const number = (form: FormData, name: string) =>
  value(form, name) ? Number(value(form, name)) : null;
function failure(error: unknown): FormResult {
  if (error instanceof z.ZodError)
    return { error: error.issues[0]?.message ?? "Invalid input." };
  if (
    error instanceof Error &&
    !error.message.includes("prisma") &&
    !error.message.includes("Invalid `")
  )
    return { error: error.message };
  return { error: "Could not save this item. Please try again." };
}

export async function saveWorkspaceItem(
  rawKind: ModuleKey,
  id: string | null,
  form: FormData,
): Promise<FormResult> {
  try {
    const kind = keySchema.parse(rawKind);
    if (id) z.string().uuid().parse(id);
    const config = modules[kind];
    const access = await requireAccess(
      id ? config.update : config.create,
      config.feature,
    );
    const { familyId, memberId } = access;
    const scope = { familyId, deletedAt: null, ...(id ? { id } : {}) };
    switch (kind) {
      case "tasks": {
        const assigneeIds = value(form, "assigneeId")
          ? [value(form, "assigneeId")]
          : [];
        const input = taskSchema.parse({
          title: value(form, "title"),
          description: optional(form, "description"),
          dueAt: optionalDate(form, "dueAt")?.toISOString(),
          priority: value(form, "priority"),
          status: value(form, "status"),
          assigneeIds,
        });
        if (
          assigneeIds.length &&
          !hasPermission(access.membership, "tasks.assign")
        )
          throw new Error("You cannot assign tasks.");
        if (
          assigneeIds.length &&
          !(await prisma.familyMember.findFirst({
            where: {
              id: assigneeIds[0],
              familyId,
              status: "ACTIVE",
              internalRole: { not: "HIDDEN_ADMIN" },
            },
          }))
        )
          throw new Error("Invalid assignee.");
        await prisma.$transaction(async (tx) => {
          if (id && !(await tx.task.findFirst({ where: scope })))
            throw new Error("Task not found.");
          const data = {
            title: input.title,
            description: input.description,
            priority: input.priority,
            status: input.status,
            dueAt: input.dueAt ? new Date(input.dueAt) : null,
            completedAt: input.status === "COMPLETED" ? new Date() : null,
            completedByMemberId: input.status === "COMPLETED" ? memberId : null,
          };
          const task = id
            ? await tx.task.update({ where: { id, familyId }, data })
            : await tx.task.create({
                data: { ...data, familyId, createdByMemberId: memberId },
              });
          if (hasPermission(access.membership, "tasks.assign")) {
            await tx.taskAssignment.deleteMany({ where: { taskId: task.id } });
            if (assigneeIds.length)
              await tx.taskAssignment.createMany({
                data: assigneeIds.map((memberId) => ({
                  taskId: task.id,
                  memberId,
                })),
              });
          }
          await tx.taskHistory.create({
            data: {
              taskId: task.id,
              actorMemberId: memberId,
              action: id ? "updated" : "created",
              metadata: { status: input.status },
            },
          });
          if (assigneeIds.length)
            await notifyFamily(tx, {
              familyId,
              actorUserId: access.user.id,
              memberIds: assigneeIds,
              category: "tasks",
              title: "Task assigned to you",
              body: input.title,
              link: "/tasks",
            });
        });
        break;
      }
      case "notebook":
      case "personal": {
        const title = titleSchema.parse(value(form, "title"));
        const content = textDocument(bodySchema.parse(value(form, "body")));
        const notebookWhere =
          kind === "personal"
            ? { type: "PERSONAL" as const, ownerId: access.user.id }
            : { type: "FAMILY" as const, familyId };
        await prisma.$transaction(async (tx) => {
          if (id) {
            const page = await tx.notebookPage.findFirst({
              where: { id, deletedAt: null, notebook: notebookWhere },
            });
            if (!page) throw new Error("Note not found.");
            await tx.notebookPageVersion.create({
              data: {
                pageId: id,
                editorMemberId: memberId,
                content: page.content ?? textDocument(""),
              },
            });
            await tx.notebookPage.update({
              where: { id },
              data: { title, content, updatedByMemberId: memberId },
            });
          } else {
            const notebook =
              (await tx.notebook.findFirst({ where: notebookWhere })) ??
              (await tx.notebook.create({ data: notebookWhere }));
            await tx.notebookPage.create({
              data: {
                notebookId: notebook.id,
                title,
                content,
                createdByMemberId: memberId,
              },
            });
          }
        });
        break;
      }
      case "contacts": {
        const input = contactSchema.parse({
          name: value(form, "name"),
          category: value(form, "category"),
          phone: optional(form, "phone"),
          email: optional(form, "email"),
          address: optional(form, "address"),
          website: optional(form, "website"),
          notes: optional(form, "notes"),
          isEmergency: form.get("isEmergency") === "on",
        });
        if (input.website && !/^https?:\/\//i.test(input.website))
          throw new Error("Website must use http or https.");
        if (id)
          await prisma.familyContact.update({
            where: { id, familyId },
            data: input,
          });
        else
          await prisma.familyContact.create({
            data: { ...input, familyId, createdByMemberId: memberId },
          });
        break;
      }
      case "recipes": {
        const input = recipeSchema.parse({
          title: value(form, "title"),
          ingredients: value(form, "ingredients").split("\n").filter(Boolean),
          instructions: textDocument(bodySchema.parse(value(form, "body"))),
          prepMinutes: number(form, "prepMinutes"),
          cookMinutes: number(form, "cookMinutes"),
          servings: number(form, "servings"),
        });
        const data = {
          ...input,
          ingredients: input.ingredients as string[],
          instructions: textDocument(value(form, "body")),
        };
        if (id)
          await prisma.recipe.update({
            where: { id, familyId, deletedAt: null },
            data,
          });
        else
          await prisma.recipe.create({
            data: { ...data, familyId, createdByMemberId: memberId },
          });
        break;
      }
      case "announcements": {
        const title = titleSchema.parse(value(form, "title"));
        const content = textDocument(bodySchema.parse(value(form, "body")));
        const priority = z
          .enum(["NORMAL", "IMPORTANT", "URGENT"])
          .parse(value(form, "priority"));
        const status = z
          .enum(["DRAFT", "SCHEDULED", "PUBLISHED", "ARCHIVED"])
          .parse(value(form, "status"));
        const scheduledFor = optionalDate(form, "scheduledFor");
        const expiresAt = optionalDate(form, "expiresAt");
        if (status === "SCHEDULED" && !scheduledFor)
          throw new Error(
            "Choose a publication date for a scheduled announcement.",
          );
        if (expiresAt && expiresAt <= (scheduledFor ?? new Date()))
          throw new Error("Expiry must be after publication.");
        const data = {
          title,
          content,
          priority,
          status,
          scheduledFor,
          expiresAt,
          publishedAt: status === "PUBLISHED" ? new Date() : null,
          updatedByMemberId: memberId,
        };
        await prisma.$transaction(async (tx) => {
          const previous = id
            ? await tx.announcement.findFirst({
                where: { id, familyId, deletedAt: null },
              })
            : null;
          if (id && !previous) throw new Error("Announcement not found.");
          if (id)
            await tx.announcement.update({ where: { id, familyId }, data });
          else
            await tx.announcement.create({
              data: { ...data, familyId, createdByMemberId: memberId },
            });
          if (status === "PUBLISHED" && previous?.status !== "PUBLISHED")
            await notifyFamily(tx, {
              familyId,
              actorUserId: access.user.id,
              category: "announcements",
              title,
              link: "/announcements",
            });
        });
        break;
      }
      case "files":
      case "memories": {
        if (id) {
          if (kind === "files")
            await prisma.file.update({
              where: { id, familyId, deletedAt: null },
              data: { name: titleSchema.parse(value(form, "name")) },
            });
          else
            await prisma.memory.update({
              where: { id, familyId, deletedAt: null },
              data: {
                caption: titleSchema.parse(value(form, "caption")),
                takenAt: optionalDate(form, "takenAt"),
              },
            });
          break;
        }
        const file = form.get("file");
        if (
          !(file instanceof File) ||
          file.size === 0 ||
          file.size > 10 * 1024 * 1024
        )
          throw new Error("Choose a file between 1 byte and 10 MB.");
        const bytes = new Uint8Array(await file.arrayBuffer());
        const detected = await fileTypeFromBuffer(bytes);
        const mimeType =
          detected?.mime ??
          (file.name.toLowerCase().endsWith(".txt") && looksLikePlainText(bytes)
            ? "text/plain"
            : "");
        const category = Object.entries(ALLOWED_MIME_TYPES).find(([, types]) =>
          types.includes(mimeType),
        )?.[0] as "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | undefined;
        if (
          !category ||
          (kind === "memories" && category !== "IMAGE" && category !== "VIDEO")
        )
          throw new Error(
            "Unsupported file type. Use a photo, video, audio file, PDF, Office document or plain text.",
          );
        const name = titleSchema.parse(
          value(form, kind === "files" ? "name" : "caption"),
        );
        const takenAt = optionalDate(form, "takenAt");
        memorySchema.parse({ takenAt: takenAt?.toISOString() });
        const group = z
          .string()
          .max(100)
          .parse(value(form, kind === "files" ? "folder" : "album"));
        const bucket = "families";
        const storagePath = `${familyId}/${kind}/${crypto.randomUUID()}.${detected?.ext ?? "txt"}`;
        const storage = (await getSupabaseServerClient()).storage.from(bucket);
        const uploaded = await storage.upload(storagePath, bytes, {
          contentType: mimeType,
          upsert: false,
        });
        if (uploaded.error) throw new Error("Upload failed. Please try again.");
        try {
          await prisma.$transaction(async (tx) => {
            const blob = await tx.fileBlob.create({
              data: {
                familyId,
                bucket,
                storagePath,
                fileName: file.name.slice(0, 250),
                mimeType,
                size: bytes.length,
                category,
              },
            });
            if (kind === "files") {
              const folder = group
                ? ((await tx.folder.findFirst({
                    where: {
                      familyId,
                      name: group,
                      deletedAt: null,
                      parentId: null,
                    },
                  })) ??
                  (await tx.folder.create({
                    data: {
                      familyId,
                      name: group,
                      createdByMemberId: memberId,
                    },
                  })))
                : null;
              await tx.file.create({
                data: {
                  familyId,
                  name,
                  blobId: blob.id,
                  folderId: folder?.id,
                  uploadedByMemberId: memberId,
                },
              });
            } else {
              const album = group
                ? ((await tx.album.findFirst({
                    where: { familyId, name: group },
                  })) ??
                  (await tx.album.create({
                    data: {
                      familyId,
                      name: group,
                      createdByMemberId: memberId,
                    },
                  })))
                : null;
              await tx.memory.create({
                data: {
                  familyId,
                  caption: name,
                  takenAt,
                  albumId: album?.id,
                  uploadedByMemberId: memberId,
                  assets: {
                    create: {
                      blobId: blob.id,
                      kind: category === "VIDEO" ? "VIDEO" : "IMAGE",
                    },
                  },
                },
              });
            }
          });
        } catch (error) {
          await storage.remove([storagePath]);
          throw error;
        }
        break;
      }
      case "polls": {
        if (id) throw new Error("Published polls cannot be edited.");
        const input = pollSchema.parse({
          question: value(form, "question"),
          options: value(form, "options")
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
          deadline: optionalDate(form, "deadline")?.toISOString(),
          isMultipleChoice: form.get("isMultipleChoice") === "on",
          isAnonymous: form.get("isAnonymous") === "on",
        });
        if (new Set(input.options).size !== input.options.length)
          throw new Error("Poll options must be different.");
        if (input.deadline && new Date(input.deadline) <= new Date())
          throw new Error("Deadline must be in the future.");
        const { options, ...data } = input;
        await prisma.poll.create({
          data: {
            ...data,
            deadline: input.deadline ? new Date(input.deadline) : null,
            familyId,
            createdByMemberId: memberId,
            options: { create: options.map((label) => ({ label })) },
          },
        });
        break;
      }
    }
    revalidatePath(config.path);
    revalidatePath("/");
    return { success: "Saved." };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteWorkspaceItem(
  rawKind: ModuleKey,
  rawId: string,
): Promise<FormResult> {
  try {
    const kind = keySchema.parse(rawKind);
    const id = z.string().uuid().parse(rawId);
    const access = await requireAccess(
      modules[kind].delete,
      modules[kind].feature,
    );
    const familyId = access.familyId;
    const deletedAt = new Date();
    switch (kind) {
      case "tasks":
        await prisma.task.update({
          where: { id, familyId, deletedAt: null },
          data: { deletedAt },
        });
        break;
      case "notebook":
      case "personal": {
        const result = await prisma.notebookPage.updateMany({
          where: {
            id,
            deletedAt: null,
            notebook:
              kind === "personal"
                ? { type: "PERSONAL", ownerId: access.user.id }
                : { type: "FAMILY", familyId },
          },
          data: { deletedAt, status: "TRASHED" },
        });
        if (!result.count) throw new Error("Note not found.");
        break;
      }
      case "contacts":
        await prisma.familyContact.delete({ where: { id, familyId } });
        break;
      case "recipes":
        await prisma.recipe.update({
          where: { id, familyId, deletedAt: null },
          data: { deletedAt },
        });
        break;
      case "announcements":
        await prisma.announcement.update({
          where: { id, familyId, deletedAt: null },
          data: { deletedAt },
        });
        break;
      case "files":
        await prisma.file.update({
          where: { id, familyId, deletedAt: null },
          data: { deletedAt },
        });
        break;
      case "memories":
        await prisma.memory.update({
          where: { id, familyId, deletedAt: null },
          data: { deletedAt },
        });
        break;
      case "polls":
        await prisma.poll.update({
          where: { id, familyId, createdByMemberId: access.memberId },
          data: { status: "CLOSED", closedAt: new Date() },
        });
        break;
    }
    revalidatePath(modules[kind].path);
    return { success: kind === "polls" ? "Poll closed." : "Deleted." };
  } catch (error) {
    return failure(error);
  }
}

export async function voteInPoll(
  pollId: string,
  optionId: string,
): Promise<FormResult> {
  try {
    z.string().uuid().parse(pollId);
    z.string().uuid().parse(optionId);
    const access = await requireAccess("polls.vote", "polls");
    await prisma.$transaction(
      async (tx) => {
        const poll = await tx.poll.findFirst({
          where: { id: pollId, familyId: access.familyId },
          include: {
            options: { select: { id: true } },
            votes: { where: { memberId: access.memberId } },
          },
        });
        if (
          !poll ||
          poll.status !== "OPEN" ||
          (poll.deadline && poll.deadline <= new Date())
        )
          throw new Error("Voting is closed.");
        if (!poll.options.some((o) => o.id === optionId))
          throw new Error("Invalid option.");
        if (!poll.allowChangeVote && poll.votes.length)
          throw new Error("Your vote cannot be changed.");
        const existing = poll.votes.find((v) => v.optionId === optionId);
        if (!poll.isMultipleChoice)
          await tx.pollVote.deleteMany({
            where: { pollId, memberId: access.memberId },
          });
        if (existing && poll.isMultipleChoice)
          await tx.pollVote.delete({ where: { id: existing.id } });
        else
          await tx.pollVote.create({
            data: { pollId, optionId, memberId: access.memberId },
          });
      },
      { isolationLevel: "Serializable" },
    );
    revalidatePath("/tools/polls");
    return { success: "Vote saved." };
  } catch (error) {
    return failure(error);
  }
}
