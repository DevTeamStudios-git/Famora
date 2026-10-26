import Link from "next/link";
import { requireAccess } from "@/server/workspace-access";
import { prisma } from "@/lib/prisma/client";
import { administer } from "@/server/actions/admin";
import { ActionForm } from "@/components/core/action-form";
import { FormField } from "@/components/core/workspace";
import { WorkspacePage } from "@/components/core/workspace-page";
import {
  PERMISSIONS,
  type PermissionKey,
} from "@/lib/authorization/permissions";
import { hasPermission } from "@/lib/authorization/authorization";
import { getDisplayRoleLabel } from "@/lib/authorization/roles";
import { FEATURE_KEYS_LIST } from "@/lib/realtime/registry";

const required: Record<string, PermissionKey> = {
  overview: "admin_panel.access",
  access: "whitelist.read",
  members: "members.read",
  roles: "members.change_role",
  tools: "tools.manage",
  family: "family.update",
  chat: "chat.moderate",
  moderation: "chat.moderate",
  "audit-log": "audit.read",
  security: "security.manage",
  notifications: "tools.manage",
  agenda: "agenda.manage",
  files: "files.manage",
  announcements: "announcements.manage",
};
function Confirmation() {
  return (
    <FormField
      field={{
        name: "confirmation",
        label: "Type CONFIRM to approve this access change",
        required: true,
      }}
    />
  );
}
export async function AdminPage({ section }: { section: string }) {
  const access = await requireAccess(required[section] ?? "admin_panel.access");
  const familyId = access.familyId;
  if (section === "announcements" || section === "files")
    return <WorkspacePage kind={section} />;
  if (section === "agenda")
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Agenda Management</h1>
        <p>Manage events and calendars in the family agenda.</p>
        <Link className="text-primary underline" href="/agenda">
          Open agenda
        </Link>
      </div>
    );
  if (section === "access") {
    const rows = await prisma.familyWhitelistEntry.findMany({
      where: { familyId, internalRole: { not: "HIDDEN_ADMIN" } },
      select: { id: true, email: true, status: true, internalRole: true },
      orderBy: { email: "asc" },
    });
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold">Family Access</h1>
        {hasPermission(access.membership, "whitelist.add") && (
          <ActionForm
            action={administer.bind(null, "whitelist")}
            submit="Approve Google account"
          >
            <FormField
              field={{
                name: "email",
                label: "Google email",
                type: "email",
                required: true,
              }}
            />
            <FormField
              field={{
                name: "role",
                label: "Role",
                options: ["MEMBER", "CO_FAMILY_CHIEF", "FAMILY_CHIEF"],
              }}
            />
          </ActionForm>
        )}
        {rows.map((r) => (
          <article key={r.id} className="space-y-3 rounded-xl border p-4">
            <p className="font-medium">{r.email}</p>
            <p className="text-sm">
              {getDisplayRoleLabel(r.internalRole)} · {r.status}
            </p>
            {hasPermission(access.membership, "whitelist.disable") &&
              r.internalRole !== "FAMILY_CHIEF" && (
                <details>
                  <summary className="cursor-pointer text-sm text-primary">
                    Change access
                  </summary>
                  <ActionForm action={administer.bind(null, "access")}>
                    <input type="hidden" name="id" value={r.id} />
                    <FormField
                      field={{
                        name: "status",
                        label: "Access",
                        options: ["ACTIVE", "DISABLED"],
                      }}
                      value={r.status}
                    />
                    <Confirmation />
                  </ActionForm>
                </details>
              )}
          </article>
        ))}
      </div>
    );
  }
  if (section === "members" || section === "roles") {
    const members = await prisma.familyMember.findMany({
      where: { familyId, internalRole: { not: "HIDDEN_ADMIN" } },
      select: {
        id: true,
        status: true,
        internalRole: true,
        user: { select: { displayName: true } },
        grants: { select: { permission: true, granted: true } },
      },
      orderBy: { joinedAt: "asc" },
    });
    return (
      <div className="space-y-5">
        <h1 className="text-xl font-semibold">
          {section === "roles" ? "Roles & Permissions" : "Member Management"}
        </h1>
        {members.map((m) => (
          <article key={m.id} className="space-y-3 rounded-xl border p-4">
            <h2 className="font-medium">{m.user.displayName}</h2>
            <p className="text-sm">
              {getDisplayRoleLabel(m.internalRole)} · {m.status}
            </p>
            {m.internalRole !== "FAMILY_CHIEF" && m.id !== access.memberId && (
              <>
                {section === "members" &&
                  hasPermission(access.membership, "members.disable") && (
                    <details>
                      <summary className="cursor-pointer text-sm text-primary">
                        Change access
                      </summary>
                      <ActionForm action={administer.bind(null, "member")}>
                        <input type="hidden" name="id" value={m.id} />
                        <FormField
                          field={{
                            name: "status",
                            label: "Access",
                            options: ["ACTIVE", "DISABLED"],
                          }}
                          value={m.status}
                        />
                        <Confirmation />
                      </ActionForm>
                    </details>
                  )}
                {section === "roles" && (
                  <>
                    <ActionForm action={administer.bind(null, "role")}>
                      <input type="hidden" name="id" value={m.id} />
                      <FormField
                        field={{
                          name: "role",
                          label: "Role",
                          options: [
                            "MEMBER",
                            "CO_FAMILY_CHIEF",
                            "FAMILY_CHIEF",
                          ],
                        }}
                        value={m.internalRole}
                      />
                      <Confirmation />
                    </ActionForm>
                    <details>
                      <summary className="cursor-pointer text-sm text-primary">
                        Permission overrides
                      </summary>
                      <p className="my-3 text-xs">
                        {m.grants
                          .map(
                            (g) =>
                              `${g.permission}: ${g.granted ? "allowed" : "denied"}`,
                          )
                          .join(" · ") || "Using role defaults."}
                      </p>
                      <ActionForm action={administer.bind(null, "grant")}>
                        <input type="hidden" name="id" value={m.id} />
                        <FormField
                          field={{
                            name: "permission",
                            label: "Permission",
                            options: Object.keys(PERMISSIONS).filter((p) =>
                              hasPermission(
                                access.membership,
                                p as PermissionKey,
                              ),
                            ),
                          }}
                        />
                        <FormField
                          field={{
                            name: "mode",
                            label: "Override",
                            options: ["default", "allow", "deny"],
                          }}
                        />
                        <Confirmation />
                      </ActionForm>
                    </details>
                  </>
                )}
              </>
            )}
          </article>
        ))}
      </div>
    );
  }
  if (section === "tools") {
    const flags = await prisma.familyFeature.findMany({ where: { familyId } });
    return (
      <div className="space-y-5">
        <h1 className="text-xl font-semibold">Tools Management</h1>
        {FEATURE_KEYS_LIST.map((key) => (
          <ActionForm
            key={key}
            action={administer.bind(null, "feature")}
            className="rounded-xl border p-4"
          >
            <input type="hidden" name="key" value={key} />
            <FormField
              field={{
                name: "enabled",
                label: `Enable ${key}`,
                type: "checkbox",
              }}
              value={flags.find((f) => f.key === key)?.enabled ?? true}
            />
          </ActionForm>
        ))}
      </div>
    );
  }
  if (section === "family") {
    const family = await prisma.family.findUniqueOrThrow({
      where: { id: familyId },
    });
    return (
      <div className="max-w-xl space-y-5">
        <h1 className="text-xl font-semibold">Family Settings</h1>
        <ActionForm action={administer.bind(null, "family")}>
          <FormField
            field={{ name: "name", label: "Family name", required: true }}
            value={family.name}
          />
          <FormField
            field={{
              name: "description",
              label: "Description",
              type: "textarea",
            }}
            value={family.description ?? ""}
          />
          <FormField
            field={{ name: "timezone", label: "Time zone", required: true }}
            value={family.timezone}
          />
        </ActionForm>
      </div>
    );
  }
  if (section === "chat" || section === "moderation") {
    const settings = await prisma.familySettings.findUnique({
      where: { familyId },
    });
    return (
      <div className="space-y-5">
        <h1 className="text-xl font-semibold">Chat Management</h1>
        <ActionForm action={administer.bind(null, "chat")}>
          {(
            [
              "chatEnabled",
              "dmsEnabled",
              "attachmentsEnabled",
              "voiceMessagesEnabled",
              "reactionsEnabled",
            ] as const
          ).map((name) => (
            <FormField
              key={name}
              field={{
                name,
                label: name.replace(/([A-Z])/g, " $1"),
                type: "checkbox",
              }}
              value={settings?.[name] ?? true}
            />
          ))}
        </ActionForm>
        <Link className="text-primary underline" href="/chat">
          Open chat to moderate messages
        </Link>
      </div>
    );
  }
  if (section === "audit-log") {
    const rows = await prisma.auditLog.findMany({
      where: {
        familyId,
        actorRole: { not: "HIDDEN_ADMIN" },
        OR: [
          { targetMemberId: null },
          { target: { internalRole: { not: "HIDDEN_ADMIN" } } },
        ],
      },
      select: { id: true, action: true, result: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Audit Log</h1>
        {rows.length === 0 && <p>No administrative activity yet.</p>}
        {rows.map((r) => (
          <article className="rounded-lg border p-3 text-sm" key={r.id}>
            {r.action} · {r.result}
            <p className="text-xs text-muted-foreground">
              {r.createdAt.toLocaleString()}
            </p>
          </article>
        ))}
      </div>
    );
  }
  if (section === "security")
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Security</h1>
        <p className="text-sm">
          Access requires an approved Google account and active family
          membership. All administrative changes are recorded.
        </p>
        <Link className="block text-primary underline" href="/admin/access">
          Manage approved accounts
        </Link>
        <Link className="block text-primary underline" href="/admin/members">
          Disable a member’s access
        </Link>
        <Link
          className="block text-primary underline"
          href="/settings/sessions"
        >
          Sign out your devices
        </Link>
      </div>
    );
  if (section === "notifications")
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Notifications</h1>
        <p className="text-sm">
          Members receive in-app notifications for direct messages and can
          manage their notification preferences.
        </p>
        <Link className="text-primary underline" href="/settings/notifications">
          Manage your notification preferences
        </Link>
      </div>
    );
  const [members, tasks, files, events] = await Promise.all([
    prisma.familyMember.count({
      where: {
        familyId,
        status: "ACTIVE",
        internalRole: { not: "HIDDEN_ADMIN" },
      },
    }),
    prisma.task.count({
      where: { familyId, deletedAt: null, status: { not: "COMPLETED" } },
    }),
    prisma.file.count({ where: { familyId, deletedAt: null } }),
    prisma.calendarEvent.count({
      where: { familyId, deletedAt: null, visibility: "FAMILY" },
    }),
  ]);
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Admin Overview</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {Object.entries({
          "Active members": members,
          "Open tasks": tasks,
          Files: files,
          "Family events": events,
        }).map(([label, count]) => (
          <div key={label} className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-3xl font-semibold">{count}</p>
          </div>
        ))}
      </div>
      <Link className="text-primary underline" href="/">
        Return to family home
      </Link>
    </div>
  );
}
