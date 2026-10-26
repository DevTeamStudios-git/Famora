import "server-only";
import { cache } from "react";

import { prisma } from "@/lib/prisma/client";
import { FEATURE_KEYS_LIST } from "@/lib/realtime/registry";

export const getFamilyWithFeatures = cache(async (familyId: string) => {
  const family = await prisma.family.findUnique({
    where: { id: familyId },
    include: {
      settings: true,
      features: true,
    },
  });
  if (!family) return null;

  return {
    id: family.id,
    name: family.name,
    description: family.description,
    settings: family.settings,
    features: new Set(
      FEATURE_KEYS_LIST.filter(
        (key) => family.features.find((f) => f.key === key)?.enabled !== false,
      ),
    ),
  };
});
