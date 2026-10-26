import { requireAccess } from "@/server/workspace-access";
import { prisma } from "@/lib/prisma/client";
import { getDisplayRoleLabel } from "@/lib/authorization/roles";
export default async function Page() {
  const access = await requireAccess("members.read");
  const members = await prisma.familyMember.findMany({
    where: {
      familyId: access.familyId,
      status: "ACTIVE",
      internalRole: { not: "HIDDEN_ADMIN" },
    },
    select: {
      id: true,
      internalRole: true,
      user: { select: { displayName: true, bio: true } },
    },
    orderBy: { joinedAt: "asc" },
  });
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Family Members</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {members.map((m) => (
          <article
            className="space-y-2 rounded-xl border bg-card p-5"
            key={m.id}
          >
            <h2 className="font-semibold">{m.user.displayName}</h2>
            <p className="text-xs text-muted-foreground">
              {getDisplayRoleLabel(m.internalRole)}
            </p>
            <p className="text-sm">{m.user.bio}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
