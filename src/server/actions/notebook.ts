"use server";
import { z } from "zod";
import { prisma } from "@/lib/prisma/client";
import { requireAccess } from "@/server/workspace-access";
import { revalidatePath } from "next/cache";
import { documentText, textDocument } from "@/lib/workspace";
import type { FormResult } from "@/components/core/action-form";
async function scope(personal: boolean, edit: boolean) {
  const access = await requireAccess(
    personal
      ? "notebook.personal"
      : edit
        ? "notebook.family_update"
        : "notebook.family_read",
    "notebook",
  );
  return {
    access,
    notebook: personal
      ? { type: "PERSONAL" as const, ownerId: access.user.id }
      : { type: "FAMILY" as const, familyId: access.familyId },
  };
}
export async function fetchNoteHistory(pageId: string, personal: boolean) {
  z.string().uuid().parse(pageId);
  const { notebook } = await scope(personal === true, false);
  const page = await prisma.notebookPage.findFirst({
    where: { id: pageId, notebook, deletedAt: null },
    select: { id: true },
  });
  if (!page) throw new Error("Note not found.");
  const versions = await prisma.notebookPageVersion.findMany({
    where: { pageId },
    select: { id: true, content: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return versions.map((v) => ({
    id: v.id,
    body: documentText(v.content),
    createdAt: v.createdAt.toISOString(),
  }));
}
export async function restoreNoteVersion(
  pageId: string,
  versionId: string,
  personal: boolean,
): Promise<FormResult> {
  z.string().uuid().parse(pageId);
  z.string().uuid().parse(versionId);
  const { access, notebook } = await scope(personal === true, true);
  try {
    await prisma.$transaction(async (tx) => {
      const page = await tx.notebookPage.findFirst({
        where: { id: pageId, notebook, deletedAt: null },
      });
      const version = await tx.notebookPageVersion.findFirst({
        where: { id: versionId, pageId },
      });
      if (!page || !version) throw new Error("Version not found.");
      await tx.notebookPageVersion.create({
        data: {
          pageId,
          editorMemberId: access.memberId,
          content: page.content ?? textDocument(""),
        },
      });
      await tx.notebookPage.update({
        where: { id: pageId },
        data: {
          content: version.content ?? textDocument(""),
          updatedByMemberId: access.memberId,
        },
      });
    });
    revalidatePath(personal ? "/notebook/personal" : "/notebook");
    return { success: "Version restored." };
  } catch {
    return { error: "Could not restore this version." };
  }
}
