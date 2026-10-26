import "server-only";
import { redirect } from "next/navigation";
import { getAccessState } from "@/lib/auth/session";
import { hasPermission } from "@/lib/authorization/authorization";
import type { PermissionKey } from "@/lib/authorization/permissions";
import { prisma } from "@/lib/prisma/client";

export async function requireAccess(
  permission?: PermissionKey,
  feature?: string,
) {
  const access = await getAccessState();
  if (access.status !== "authorized")
    redirect(access.status === "unauthenticated" ? "/login" : "/access-denied");
  if (permission && !hasPermission(access.membership, permission))
    throw new Error("You do not have permission to do this.");
  if (feature) {
    const flag = await prisma.familyFeature.findUnique({
      where: { familyId_key: { familyId: access.familyId, key: feature } },
    });
    if (flag?.enabled === false)
      throw new Error("This tool is disabled for your family.");
    if (feature === "dms") {
      const settings = await prisma.familySettings.findUnique({
        where: { familyId: access.familyId },
      });
      if (settings?.dmsEnabled === false)
        throw new Error("Direct messages are disabled for your family.");
    }
  }
  return access;
}
