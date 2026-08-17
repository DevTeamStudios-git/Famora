import "server-only";

import { prisma } from "@/lib/prisma/client";

export async function getFamilyWithFeatures(familyId: string) {
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
    features: new Set(family.features.filter((f) => f.enabled).map((f) => f.key)),
  };
}