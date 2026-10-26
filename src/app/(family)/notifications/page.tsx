import Link from "next/link";
import { requireAccess } from "@/server/workspace-access";
import { prisma } from "@/lib/prisma/client";
import { markNotificationsRead } from "@/server/actions/account";
import { ActionForm } from "@/components/core/action-form";
import { Refresh } from "@/components/core/refresh";
export default async function Page() {
  const access = await requireAccess("notifications.read");
  const rows = await prisma.notification.findMany({
    where: { userId: access.user.id, familyId: access.familyId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return (
    <div className="space-y-5">
      <Refresh />
      <h1 className="text-2xl font-semibold">Notifications</h1>
      {rows.some((r) => !r.readAt) && (
        <ActionForm
          action={async () => {
            "use server";
            return markNotificationsRead();
          }}
          submit="Mark all as read"
        />
      )}
      {rows.length === 0 && (
        <p className="text-muted-foreground">You’re all caught up.</p>
      )}
      {rows.map((r) => (
        <article
          key={r.id}
          className={`space-y-2 rounded-xl border p-4 ${r.readAt ? "" : "bg-accent/50"}`}
        >
          <h2 className="font-medium">{r.title}</h2>
          <p className="text-sm">{r.body}</p>
          <p className="text-xs text-muted-foreground">
            {r.createdAt.toLocaleString()}
          </p>
          {r.link?.startsWith("/") && !r.link.startsWith("//") && (
            <Link className="text-sm text-primary underline" href={r.link}>
              Open
            </Link>
          )}
          {!r.readAt && (
            <ActionForm
              action={async () => {
                "use server";
                return markNotificationsRead(r.id);
              }}
              submit="Mark as read"
            />
          )}
        </article>
      ))}
    </div>
  );
}
