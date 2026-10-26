"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAccess } from "@/server/workspace-access";
import { prisma } from "@/lib/prisma/client";
import { profileSchema } from "@/lib/validation/schemas";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { FormResult } from "@/components/core/action-form";
import { preferenceSections } from "@/lib/preferences";
import { fileTypeFromBuffer } from "file-type";

export async function saveProfile(data: FormData): Promise<FormResult> {
  const access = await requireAccess();
  const parsed = profileSchema.safeParse(
    Object.fromEntries(
      [...data.entries()].map(([k, v]) => [k, v === "" ? null : v]),
    ),
  );
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { birthday, timezone, language, ...profile } = parsed.data;
  try {
    if (timezone) new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch {
    return { error: "Enter a valid time zone, such as America/Toronto." };
  }
  let avatarUrl: string | undefined;
  const avatar = data.get("avatarUpload");
  if (avatar instanceof File && avatar.size > 0) {
    if (avatar.size > 3 * 1024 * 1024)
      return { error: "Choose an avatar smaller than 3 MB." };
    const bytes = new Uint8Array(await avatar.arrayBuffer());
    const type = await fileTypeFromBuffer(bytes);
    if (!type || !["image/jpeg", "image/png", "image/webp"].includes(type.mime))
      return { error: "Choose a JPEG, PNG or WebP avatar." };
    const storage = (await getSupabaseServerClient()).storage.from("avatars");
    const path = `users/${access.user.id}/avatar-${crypto.randomUUID()}.${type.ext}`;
    const upload = await storage.upload(path, bytes, {
      contentType: type.mime,
    });
    if (upload.error) return { error: "Could not upload your avatar." };
    avatarUrl = storage.getPublicUrl(path).data.publicUrl;
  }
  await prisma.user.update({
    where: { id: access.user.id },
    data: {
      ...profile,
      avatarUrl,
      birthday: birthday ? new Date(birthday) : null,
      timezone: timezone ?? undefined,
      language: language ?? undefined,
    },
  });
  revalidatePath("/", "layout");
  return { success: "Profile saved." };
}

export async function savePreferences(
  section: string,
  form: FormData,
): Promise<FormResult> {
  const access = await requireAccess();
  const config = preferenceSections[section];
  if (!config) return { error: "Unknown preferences." };
  const values: Record<string, string | boolean> = {};
  for (const field of config.fields) {
    const value =
      field.type === "checkbox"
        ? form.get(field.name) === "on"
        : String(form.get(field.name) ?? "").slice(0, 200);
    if (field.options && !field.options.includes(String(value)))
      return { error: "Invalid preference." };
    values[field.name] = value;
  }
  await prisma.$transaction(
    async (tx) => {
      const current = await tx.userSettings.findUnique({
        where: { userId: access.user.id },
      });
      const appearance =
        current?.appearanceJson &&
        typeof current.appearanceJson === "object" &&
        !Array.isArray(current.appearanceJson)
          ? current.appearanceJson
          : {};
      const data = {
        appearanceJson: { ...appearance, [section]: values },
        ...(section === "appearance"
          ? { theme: String(values.theme), density: String(values.density) }
          : {}),
        ...(section === "accessibility" ? { accessibilityJson: values } : {}),
      };
      await tx.userSettings.upsert({
        where: { userId: access.user.id },
        create: { userId: access.user.id, ...data },
        update: data,
      });
    },
    { isolationLevel: "Serializable" },
  );
  if (section === "notifications") {
    for (const [category, enabled] of Object.entries(values))
      await prisma.userNotificationPreference.upsert({
        where: {
          userId_familyId_category_channel: {
            userId: access.user.id,
            familyId: access.familyId,
            category,
            channel: "IN_APP",
          },
        },
        create: {
          userId: access.user.id,
          familyId: access.familyId,
          category,
          enabled: enabled === true,
        },
        update: { enabled: enabled === true },
      });
  }
  if (section === "agenda")
    await prisma.familyMemberSettings.upsert({
      where: { memberId: access.memberId },
      create: {
        memberId: access.memberId,
        defaultAgendaView: String(values.defaultView),
      },
      update: { defaultAgendaView: String(values.defaultView) },
    });
  revalidatePath("/", "layout");
  return { success: "Preferences saved." };
}

export async function markNotificationsRead(id?: string): Promise<FormResult> {
  const access = await requireAccess("notifications.read");
  if (id) z.string().uuid().parse(id);
  await prisma.notification.updateMany({
    where: {
      userId: access.user.id,
      familyId: access.familyId,
      ...(id ? { id } : {}),
      readAt: null,
    },
    data: { readAt: new Date() },
  });
  revalidatePath("/notifications");
  return { success: "Marked as read." };
}

export async function signOutEverywhere(): Promise<FormResult> {
  const client = await getSupabaseServerClient();
  const { error } = await client.auth.signOut({ scope: "global" });
  if (error) return { error: "Could not sign out. Please try again." };
  redirect("/login");
}
