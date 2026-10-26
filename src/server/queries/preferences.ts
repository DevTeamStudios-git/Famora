import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma/client";
export const preferencesForUser = cache(async (
  userId: string,
): Promise<Record<string, Record<string, string | boolean>>> => {
  const row = await prisma.userSettings.findUnique({
    where: { userId },
    select: { appearanceJson: true },
  });
  const json = row?.appearanceJson;
  return json && typeof json === "object" && !Array.isArray(json)
    ? (json as Record<string, Record<string, string | boolean>>)
    : {};
});
