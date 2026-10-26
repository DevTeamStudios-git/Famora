import "server-only";
import { prisma } from "@/lib/prisma/client";
import { requireAccess } from "@/server/workspace-access";
import { hasPermission } from "@/lib/authorization/authorization";
import {
  PERMISSIONS,
  type PermissionKey,
} from "@/lib/authorization/permissions";
import { getDisplayRoleLabel } from "@/lib/authorization/roles";
import { FEATURE_KEYS_LIST } from "@/lib/realtime/registry";
import type { Field } from "@/lib/workspace";

type Form = {
  title: string;
  action: string;
  fields: Field[];
  values: Record<string, string | boolean>;
  submit?: string;
};
type Item = { id: string; title: string; body: string; path?: string };
const confirmation: Field = {
  name: "confirmation",
  label: "Type CONFIRM to approve this access change",
  required: true,
};
const role: Field = {
  name: "role",
  label: "Role",
  options: ["MEMBER", "CO_FAMILY_CHIEF", "FAMILY_CHIEF"],
};
const status: Field = {
  name: "status",
  label: "Access",
  options: ["ACTIVE", "DISABLED"],
};
const adminPermissions: Record<string, PermissionKey> = {
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

export async function mobileAdmin(section: string) {
  if (!Object.hasOwn(adminPermissions, section))
    throw new Error("Section not found.");
  const access = await requireAccess("admin_panel.access");
  await requireAccess(adminPermissions[section]);
  const familyId = access.familyId;
  const can = (key: PermissionKey) => hasPermission(access.membership, key);
  const forms: Form[] = [],
    items: Item[] = [],
    links: { title: string; path: string }[] = [];
  let title = section.replaceAll("-", " ");
  if (section === "access") {
    title = "Family access";
    const rows = await prisma.familyWhitelistEntry.findMany({
      where: { familyId, internalRole: { not: "HIDDEN_ADMIN" } },
      select: { id: true, email: true, internalRole: true, status: true },
      orderBy: { email: "asc" },
    });
    if (can("whitelist.add"))
      forms.push({
        title: "Approve a Google account",
        action: "whitelist",
        fields: [
          {
            name: "email",
            label: "Google email",
            type: "email",
            required: true,
          },
          role,
        ],
        values: { role: "MEMBER" },
      });
    for (const row of rows) {
      items.push({
        id: row.id,
        title: row.email,
        body: `${getDisplayRoleLabel(row.internalRole)} · ${row.status}`,
      });
      if (
        can("whitelist.disable") &&
        row.internalRole !== "FAMILY_CHIEF" &&
        row.email !== access.user.email?.toLowerCase()
      )
        forms.push({
          title: `Change access: ${row.email}`,
          action: "access",
          fields: [status, confirmation],
          values: { id: row.id, status: row.status },
        });
    }
  } else if (section === "members" || section === "roles") {
    title = section === "members" ? "Member management" : "Roles & permissions";
    const rows = await prisma.familyMember.findMany({
      where: { familyId, internalRole: { not: "HIDDEN_ADMIN" } },
      select: {
        id: true,
        internalRole: true,
        status: true,
        user: { select: { displayName: true } },
        grants: { select: { permission: true, granted: true } },
      },
      orderBy: { joinedAt: "asc" },
    });
    for (const row of rows) {
      const name = row.user.displayName;
      items.push({
        id: row.id,
        title: name,
        body: `${getDisplayRoleLabel(row.internalRole)} · ${row.status}\n${row.grants.map((g) => `${g.permission}: ${g.granted ? "allowed" : "denied"}`).join(" · ")}`,
      });
      if (row.internalRole === "FAMILY_CHIEF" || row.id === access.memberId)
        continue;
      if (section === "members" && can("members.disable"))
        forms.push({
          title: `Access: ${name}`,
          action: "member",
          fields: [status, confirmation],
          values: { id: row.id, status: row.status },
        });
      if (section === "roles") {
        forms.push({
          title: `Role: ${name}`,
          action: "role",
          fields: [role, confirmation],
          values: { id: row.id, role: row.internalRole },
        });
        forms.push({
          title: `Permission override: ${name}`,
          action: "grant",
          fields: [
            {
              name: "permission",
              label: "Permission",
              options: Object.keys(PERMISSIONS).filter((p) =>
                can(p as PermissionKey),
              ),
            },
            {
              name: "mode",
              label: "Override",
              options: ["default", "allow", "deny"],
            },
            confirmation,
          ],
          values: { id: row.id, mode: "default" },
        });
      }
    }
  } else if (section === "tools") {
    title = "Tools management";
    const flags = await prisma.familyFeature.findMany({
      where: { familyId },
      select: { key: true, enabled: true },
    });
    for (const key of FEATURE_KEYS_LIST)
      forms.push({
        title: key,
        action: "feature",
        fields: [{ name: "enabled", label: `Enable ${key}`, type: "checkbox" }],
        values: {
          key,
          enabled: flags.find((f) => f.key === key)?.enabled ?? true,
        },
      });
  } else if (section === "family") {
    title = "Family settings";
    const family = await prisma.family.findUniqueOrThrow({
      where: { id: familyId },
      select: { name: true, description: true, timezone: true },
    });
    forms.push({
      title,
      action: "family",
      fields: [
        { name: "name", label: "Family name", required: true },
        { name: "description", label: "Description", type: "textarea" },
        { name: "timezone", label: "Time zone", required: true },
      ],
      values: { ...family, description: family.description ?? "" },
    });
  } else if (section === "chat" || section === "moderation") {
    title = "Chat management";
    const settings = await prisma.familySettings.findUnique({
      where: { familyId },
    });
    const names = [
      "chatEnabled",
      "dmsEnabled",
      "attachmentsEnabled",
      "voiceMessagesEnabled",
      "reactionsEnabled",
    ] as const;
    forms.push({
      title,
      action: "chat",
      fields: names.map((name) => ({
        name,
        label: name.replace(/([A-Z])/g, " $1"),
        type: "checkbox",
      })),
      values: Object.fromEntries(names.map((n) => [n, settings?.[n] ?? true])),
    });
    links.push({ title: "Moderate family chat", path: "/chat" });
  } else if (section === "audit-log") {
    title = "Audit log";
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
    items.push(
      ...rows.map((r) => ({
        id: r.id,
        title: r.action,
        body: `${r.result} · ${r.createdAt.toISOString()}`,
      })),
    );
  } else if (section === "overview") {
    title = "Family administration";
    const counts = await Promise.all([
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
    items.push(
      ...["Active members", "Open tasks", "Files", "Family events"].map(
        (name, i) => ({ id: name, title: name, body: String(counts[i]) }),
      ),
    );
    for (const [key, permission] of Object.entries(adminPermissions))
      if (key !== "overview" && can(permission))
        links.push({ title: key.replaceAll("-", " "), path: `/admin/${key}` });
  } else if (section === "security") {
    items.push({
      id: "security",
      title: "Approved Google accounts",
      body: "Access requires an approved Google account and active family membership. Administrative changes are recorded.",
    });
    links.push(
      { title: "Approved accounts", path: "/admin/access" },
      { title: "Member access", path: "/admin/members" },
      { title: "Your sessions", path: "/settings/sessions" },
    );
  } else if (section === "notifications")
    links.push({
      title: "Notification preferences",
      path: "/settings/notifications",
    });
  else
    links.push({
      title: `Manage ${section}`,
      path:
        section === "agenda"
          ? "/agenda"
          : section === "files"
            ? "/files"
            : "/announcements",
    });
  return { title, forms, items, links };
}

export async function mobileSearch(rawQuery: string) {
  const access = await requireAccess();
  const query = rawQuery.trim().slice(0, 100);
  if (query.length < 2) return [];
  const familyId = access.familyId;
  const disabled = await prisma.familyFeature.findMany({
    where: { familyId, enabled: false },
    select: { key: true },
  });
  const can = (permission: PermissionKey, feature: string) =>
    hasPermission(access.membership, permission) &&
    !disabled.some((f) => f.key === feature);
  const title = { contains: query, mode: "insensitive" as const };
  const [tasks, notes, recipes, files, contacts, events] = await Promise.all([
    can("tasks.read", "tasks")
      ? prisma.task.findMany({
          where: { familyId, deletedAt: null, title },
          select: { id: true, title: true },
          take: 20,
        })
      : [],
    can("notebook.family_read", "notebook") ||
    can("notebook.personal", "notebook")
      ? prisma.notebookPage.findMany({
          where: {
            title,
            deletedAt: null,
            status: "ACTIVE",
            OR: [
              ...(can("notebook.family_read", "notebook")
                ? [{ notebook: { type: "FAMILY" as const, familyId } }]
                : []),
              ...(can("notebook.personal", "notebook")
                ? [
                    {
                      notebook: {
                        type: "PERSONAL" as const,
                        ownerId: access.user.id,
                      },
                    },
                  ]
                : []),
            ],
          },
          select: {
            id: true,
            title: true,
            notebook: { select: { type: true } },
          },
          take: 20,
        })
      : [],
    can("recipes.read", "recipes")
      ? prisma.recipe.findMany({
          where: { familyId, deletedAt: null, title },
          select: { id: true, title: true },
          take: 20,
        })
      : [],
    can("files.read", "files")
      ? prisma.file.findMany({
          where: { familyId, deletedAt: null, name: title },
          select: { id: true, name: true },
          take: 20,
        })
      : [],
    can("contacts.read", "contacts")
      ? prisma.familyContact.findMany({
          where: { familyId, name: title },
          select: { id: true, name: true },
          take: 20,
        })
      : [],
    can("agenda.read", "agenda")
      ? prisma.calendarEvent.findMany({
          where: {
            familyId,
            deletedAt: null,
            title,
            OR: [
              { visibility: "FAMILY" },
              { createdByMemberId: access.memberId },
              { attendees: { some: { memberId: access.memberId } } },
            ],
          },
          select: { id: true, title: true },
          take: 20,
        })
      : [],
  ]);
  return [
    ...tasks.map((r) => ({ ...r, type: "Task", path: "/tasks" })),
    ...notes.map((r) => ({
      id: r.id,
      title: r.title,
      type: "Note",
      path: r.notebook.type === "PERSONAL" ? "/notebook/personal" : "/notebook",
    })),
    ...recipes.map((r) => ({ ...r, type: "Recipe", path: "/tools/recipes" })),
    ...files.map((r) => ({
      id: r.id,
      title: r.name,
      type: "File",
      path: "/files",
    })),
    ...contacts.map((r) => ({
      id: r.id,
      title: r.name,
      type: "Contact",
      path: "/contacts",
    })),
    ...events.map((r) => ({ ...r, type: "Event", path: "/agenda" })),
  ];
}
