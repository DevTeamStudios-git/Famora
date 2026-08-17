import { redirect } from "next/navigation";
import { getAccessState } from "@/lib/auth/session";
import { hasPermission } from "@/lib/authorization/authorization";
import { AdminNav } from "@/components/layout/admin-nav";

/**
 * Admin Panel layout — the server gate. Only members with the
 * `admin_panel.access` permission may enter. Co-Chief / Hidden Admin privilege
 * is verified here and by every server action; the frontend is never the only
 * enforcement layer (§40, §40.18).
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await getAccessState();
  if (access.status !== "authorized") redirect("/login");
  if (!hasPermission(access.membership, "admin_panel.access")) redirect("/");

  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <aside className="w-full shrink-0 md:w-60">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Admin Panel
        </div>
        <AdminNav />
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}