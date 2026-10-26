"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma/client";
import { requireAccess } from "@/server/workspace-access";
import { hasPermission } from "@/lib/authorization/authorization";
import {
  PERMISSIONS,
  type PermissionKey,
} from "@/lib/authorization/permissions";
import { getDisplayRole } from "@/lib/authorization/roles";
import { FEATURE_KEYS_LIST } from "@/lib/realtime/registry";
import type { FormResult } from "@/components/core/action-form";

const actions = {
  whitelist: "whitelist.add",
  access: "whitelist.disable",
  member: "members.disable",
  role: "members.change_role",
  grant: "members.change_role",
  feature: "tools.manage",
  family: "family.update",
  chat: "chat.moderate",
} satisfies Record<string, PermissionKey>;
const roles = z.enum(["MEMBER", "CO_FAMILY_CHIEF", "FAMILY_CHIEF"]);
export async function administer(
  rawAction: string,
  form: FormData,
): Promise<FormResult> {
  const action = z
    .enum([
      "whitelist",
      "access",
      "member",
      "role",
      "grant",
      "feature",
      "family",
      "chat",
    ])
    .safeParse(rawAction);
  if (!action.success) return { error: "Unknown action." };
  const access = await requireAccess("admin_panel.access");
  if (!hasPermission(access.membership, actions[action.data]))
    return { error: "You do not have permission to do this." };
  const text = (key: string) => String(form.get(key) ?? "").trim();
  if (
    ["access", "member", "role", "grant"].includes(action.data) &&
    text("confirmation") !== "CONFIRM"
  )
    return { error: "Type CONFIRM to approve this access change." };
  try {
    await prisma.$transaction(
      async (tx) => {
        let targetId: string | undefined;
        switch (action.data) {
          case "whitelist": {
            const email = z
              .string()
              .trim()
              .email()
              .toLowerCase()
              .parse(text("email"));
            const role = roles.parse(text("role"));
            // Adding an existing email must never silently replace its role/access.
            await tx.familyWhitelistEntry.create({
              data: {
                familyId: access.familyId,
                email,
                internalRole: role,
                addedBy: access.memberId,
              },
            });
            break;
          }
          case "access": {
            const id = z.string().uuid().parse(text("id"));
            const row = await tx.familyWhitelistEntry.findFirst({
              where: {
                id,
                familyId: access.familyId,
                internalRole: { not: "HIDDEN_ADMIN" },
              },
            });
            if (
              !row ||
              row.email === access.user.email?.toLowerCase() ||
              row.internalRole === "FAMILY_CHIEF"
            )
              throw new Error("This account is protected from access changes.");
            const status = z.enum(["ACTIVE", "DISABLED"]).parse(text("status"));
            await tx.familyWhitelistEntry.update({
              where: { id },
              data: {
                status,
                disabledAt: status === "DISABLED" ? new Date() : null,
              },
            });
            await tx.familyMember.updateMany({
              where: { familyId: access.familyId, user: { email: row.email } },
              data: { status },
            });
            targetId = id;
            break;
          }
          case "member":
          case "role":
          case "grant": {
            const id = z.string().uuid().parse(text("id"));
            const target = await tx.familyMember.findFirst({
              where: {
                id,
                familyId: access.familyId,
                internalRole: { not: "HIDDEN_ADMIN" },
              },
              include: { user: { select: { email: true } } },
            });
            if (
              !target ||
              id === access.memberId ||
              target.internalRole === "FAMILY_CHIEF"
            )
              throw new Error("This member is protected from access changes.");
            targetId = id;
            if (action.data === "member") {
              const status = z
                .enum(["ACTIVE", "DISABLED"])
                .parse(text("status"));
              await tx.familyMember.update({ where: { id }, data: { status } });
              await tx.familyWhitelistEntry.updateMany({
                where: { familyId: access.familyId, email: target.user.email },
                data: { status },
              });
            } else if (action.data === "role") {
              const internalRole = roles.parse(text("role"));
              await tx.familyMember.update({
                where: { id },
                data: {
                  internalRole,
                  displayRole: getDisplayRole(internalRole),
                },
              });
              await tx.familyWhitelistEntry.updateMany({
                where: { familyId: access.familyId, email: target.user.email },
                data: { internalRole },
              });
            } else {
              const permission = text("permission") as PermissionKey;
              if (
                !Object.hasOwn(PERMISSIONS, permission) ||
                !hasPermission(access.membership, permission)
              )
                throw new Error("You can only grant permissions you hold.");
              const mode = z
                .enum(["allow", "deny", "default"])
                .parse(text("mode"));
              if (mode === "default")
                await tx.familyGrant.deleteMany({
                  where: {
                    memberId: id,
                    familyId: access.familyId,
                    permission,
                  },
                });
              else
                await tx.familyGrant.upsert({
                  where: { memberId_permission: { memberId: id, permission } },
                  create: {
                    memberId: id,
                    familyId: access.familyId,
                    permission,
                    granted: mode === "allow",
                  },
                  update: { granted: mode === "allow" },
                });
            }
            break;
          }
          case "feature": {
            const key = text("key");
            if (!FEATURE_KEYS_LIST.includes(key))
              throw new Error("Unknown tool.");
            const enabled = form.get("enabled") === "on";
            await tx.familyFeature.upsert({
              where: { familyId_key: { familyId: access.familyId, key } },
              create: { familyId: access.familyId, key, enabled },
              update: { enabled },
            });
            break;
          }
          case "family": {
            const name = z.string().min(1).max(100).parse(text("name"));
            const description = z.string().max(1000).parse(text("description"));
            const timezone = text("timezone");
            try {
              new Intl.DateTimeFormat("en", { timeZone: timezone });
            } catch {
              throw new Error("Enter a valid time zone.");
            }
            await tx.family.update({
              where: { id: access.familyId },
              data: { name, description, timezone },
            });
            break;
          }
          case "chat": {
            const data = {
              chatEnabled: form.get("chatEnabled") === "on",
              dmsEnabled: form.get("dmsEnabled") === "on",
              voiceMessagesEnabled: form.get("voiceMessagesEnabled") === "on",
              attachmentsEnabled: form.get("attachmentsEnabled") === "on",
              reactionsEnabled: form.get("reactionsEnabled") === "on",
            };
            await tx.familySettings.upsert({
              where: { familyId: access.familyId },
              create: { familyId: access.familyId, ...data },
              update: data,
            });
            break;
          }
        }
        await tx.auditLog.create({
          data: {
            familyId: access.familyId,
            actorMemberId: access.memberId,
            actorRole: access.internalRole,
            action: `admin.${action.data}`,
            targetType: action.data,
            targetId,
            result: "SUCCESS",
          },
        });
      },
      { isolationLevel: "Serializable" },
    );
    revalidatePath("/", "layout");
    revalidatePath("/admin", "layout");
    return { success: "Changes saved." };
  } catch (error) {
    if (error instanceof z.ZodError) return { error: error.issues[0]?.message };
    if (
      error instanceof Error &&
      !error.message.includes("prisma") &&
      !error.message.includes("Invalid `")
    )
      return { error: error.message };
    return {
      error: "Could not save. Check for a duplicate entry and try again.",
    };
  }
}
