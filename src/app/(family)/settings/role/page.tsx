import { notFound } from "next/navigation";
import { getAccessState } from "@/lib/auth/session";
import { INTERNAL_ROLE_LABELS, getDisplayRoleLabel } from "@/lib/authorization/roles";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PERMISSION_GROUPS } from "@/lib/authorization/permissions";
import { resolveEffectivePermissions } from "@/lib/authorization/authorization";

/**
 * My Role & Permissions (§43.16).
 *
 * This is the ONLY interface where the "Hidden Admin" designation may appear,
 * and only to the user who holds it. It is marked as confidential and is
 * strictly private (§43.17–§43.19). The information is rendered server-side;
 * no other member can ever view this page as the holder.
 */
export default async function MyRoleAndPermissionsPage() {
  const access = await getAccessState();
  if (access.status !== "authorized") return notFound();

  const { membership } = access;
  const hidden = membership.internalRole === "HIDDEN_ADMIN";
  const permissions = resolveEffectivePermissions(membership);

  const visiblePermissions = hidden
    ? Object.entries(PERMISSION_GROUPS)
    : Object.entries(PERMISSION_GROUPS);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          My Role &amp; Permissions
        </h1>
        <p className="text-sm text-muted-foreground">
          Your private role information. Only visible to you.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your internal role</CardTitle>
          <CardDescription>
            The role the Famora authorization system uses for your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-2">
          {hidden ? (
            <Badge variant="default">Hidden Admin</Badge>
          ) : (
            <Badge variant="secondary">
              {INTERNAL_ROLE_LABELS[membership.internalRole]}
            </Badge>
          )}
          {hidden ? (
            <p className="text-xs text-muted-foreground">
              This information is private and visible only to you.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {!hidden ? (
        <Card>
          <CardHeader>
            <CardTitle>What others see</CardTitle>
            <CardDescription>
              Your public role as shown to family members.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Badge variant="outline">{getDisplayRoleLabel(membership.internalRole)}</Badge>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Your permissions</CardTitle>
          <CardDescription>
            {hidden
              ? "As a Hidden Admin you carry the full Family Manager permission set."
              : "Permissions granted by your current role and family configuration."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {visiblePermissions.map(([group, keys]) => {
            const granted = keys.filter((key) => permissions.has(key));
            if (granted.length === 0) return null;
            return (
              <div key={group}>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {group}
                </h3>
                <ul className="grid gap-1 sm:grid-cols-2">
                  {granted.map((key) => (
                    <li key={key} className="flex items-center gap-2 text-sm">
                      <span className="text-primary">✓</span>
                      <span className="font-mono text-xs">{key}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Security notice</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {hidden ? (
            <p>
              Your administrative status is confidential. It is never shown to
              other members — not in chat, members, tasks, presence, search,
              notifications, or the Admin Panel itself. If you lose the role,
              this page updates immediately.
            </p>
          ) : (
            <p>
              Role changes take effect immediately and are enforced server-side.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}