import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import { requireAccess } from "@/server/workspace-access";
import { hasPermission } from "@/lib/authorization/authorization";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { PermissionKey } from "@/lib/authorization/permissions";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const access = await requireAccess();
  const query = String((await searchParams).q ?? "")
    .trim()
    .slice(0, 100);
  const familyId = access.familyId;
  const disabled = await prisma.familyFeature.findMany({
    where: { familyId, enabled: false },
    select: { key: true },
  });
  const can = (permission: PermissionKey, feature: string) =>
    query.length >= 2 &&
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
    query.length >= 2
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
  const results = [
    ...tasks.map((r) => ({ ...r, href: "/tasks", type: "Task" })),
    ...notes.map((r) => ({
      id: r.id,
      title: r.title,
      href: r.notebook.type === "PERSONAL" ? "/notebook/personal" : "/notebook",
      type: "Note",
    })),
    ...recipes.map((r) => ({ ...r, href: "/tools/recipes", type: "Recipe" })),
    ...files.map((r) => ({
      id: r.id,
      title: r.name,
      href: "/files",
      type: "File",
    })),
    ...contacts.map((r) => ({
      id: r.id,
      title: r.name,
      href: "/contacts",
      type: "Contact",
    })),
    ...events.map((r) => ({ ...r, href: "/agenda", type: "Event" })),
  ];
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Search</h1>
      <form className="flex max-w-xl gap-2">
        <Input
          name="q"
          aria-label="Search family content"
          defaultValue={query}
          placeholder="Search tasks, notes, recipes, files, contacts and events…"
          minLength={2}
          maxLength={100}
          required
        />
        <Button type="submit">Search</Button>
      </form>
      {query.length >= 2 ? (
        <>
          <p className="text-sm text-muted-foreground">
            {results.length} results
          </p>
          {results.map((r) => (
            <Link
              key={`${r.type}-${r.id}`}
              href={r.href}
              className="block rounded-lg border p-4"
            >
              <span className="mr-3 text-xs text-muted-foreground">
                {r.type}
              </span>
              {r.title}
            </Link>
          ))}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Enter at least two characters.
        </p>
      )}
    </div>
  );
}
