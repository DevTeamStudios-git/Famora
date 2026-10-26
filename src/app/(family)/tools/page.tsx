import Link from "next/link";
import { modules } from "@/lib/workspace";
import { requireAccess } from "@/server/workspace-access";
import { hasPermission } from "@/lib/authorization/authorization";
import { prisma } from "@/lib/prisma/client";
export default async function Page() {
  const access = await requireAccess();
  const flags = await prisma.familyFeature.findMany({
    where: { familyId: access.familyId, enabled: false },
    select: { key: true },
  });
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Family Tools</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Object.values(modules)
          .filter(
            (m) =>
              hasPermission(access.membership, m.read) &&
              !flags.some((f) => f.key === m.feature),
          )
          .map((m) => (
            <Link
              key={m.path}
              className="rounded-xl border bg-card p-6 font-medium transition-colors hover:bg-accent"
              href={m.path}
            >
              {m.title}
              <span className="float-right" aria-hidden>
                →
              </span>
            </Link>
          ))}
      </div>
    </div>
  );
}
