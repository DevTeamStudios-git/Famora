import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import { requireAccess } from "@/server/workspace-access";
import { modules } from "@/lib/workspace";
import { hasPermission } from "@/lib/authorization/authorization";
import { Refresh } from "@/components/core/refresh";
import { preferencesForUser } from "@/server/queries/preferences";
import { redirect } from "next/navigation";
import {
  BookOpen,
  CalendarDays,
  ChefHat,
  ContactRound,
  Folder,
  Images,
  LayoutGrid,
  ListChecks,
  Megaphone,
  MessagesSquare,
  Vote,
} from "lucide-react";
const shortcutIcons: Record<string, typeof BookOpen> = {
  "/chat": MessagesSquare,
  "/agenda": CalendarDays,
  "/tasks": ListChecks,
  "/notebook": BookOpen,
  "/notebook/personal": BookOpen,
  "/contacts": ContactRound,
  "/recipes": ChefHat,
  "/announcements": Megaphone,
  "/files": Folder,
  "/memories": Images,
  "/tools/polls": Vote,
};
export const metadata = { title: "Home" };
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string }>;
}) {
  const access = await requireAccess();
  if ((await searchParams).start === "1") {
    const preferences = await preferencesForUser(access.user.id);
    const landing = preferences["family-preferences"]?.landingPage;
    if (landing === "agenda" || landing === "chat" || landing === "tasks")
      redirect(`/${landing}`);
  }
  const familyId = access.familyId;
  const disabled = await prisma.familyFeature.findMany({
    where: { familyId, enabled: false },
    select: { key: true },
  });
  const enabled = (key: string) => !disabled.some((f) => f.key === key);
  const [tasks, events, announcements] = await Promise.all([
    hasPermission(access.membership, "tasks.read") && enabled("tasks")
      ? prisma.task.findMany({
          where: { familyId, deletedAt: null, status: { not: "COMPLETED" } },
          select: { id: true, title: true, dueAt: true, priority: true },
          orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
          take: 5,
        })
      : [],
    hasPermission(access.membership, "agenda.read") && enabled("agenda")
      ? prisma.calendarEvent.findMany({
          where: {
            familyId,
            deletedAt: null,
            endAt: { gte: new Date() },
            OR: [
              { visibility: "FAMILY" },
              { createdByMemberId: access.memberId },
              { attendees: { some: { memberId: access.memberId } } },
            ],
          },
          select: { id: true, title: true, startAt: true },
          orderBy: { startAt: "asc" },
          take: 5,
        })
      : [],
    hasPermission(access.membership, "announcements.read") &&
    enabled("announcements")
      ? prisma.announcement.findMany({
          where: {
            familyId,
            deletedAt: null,
            AND: [
              {
                OR: [
                  { status: "PUBLISHED" },
                  { status: "SCHEDULED", scheduledFor: { lte: new Date() } },
                ],
              },
              { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
            ],
          },
          select: { id: true, title: true, priority: true },
          orderBy: { createdAt: "desc" },
          take: 5,
        })
      : [],
  ]);
  return (
    <div className="space-y-6">
      <Refresh />
      <div className="dashboard-hero">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em]">
          YOUR FAMILY WORKSPACE
        </p>
        <h1 className="relative z-10 text-3xl font-medium tracking-tight sm:text-4xl">
          A little more together.
        </h1>
        <p className="relative z-10 mt-3 max-w-md text-sm opacity-80">
          Make room for what matters. Your plans, conversations and family
          memories, all in one place.
        </p>
        <p className="relative z-10 mt-5 text-xs font-medium opacity-70">
          {new Date().toLocaleDateString("en-CA", {
            dateStyle: "full",
            timeZone: "America/Toronto",
          })}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          {
            title: "Family Chat",
            path: "/chat",
            feature: "chat",
            read: "chat.read" as const,
          },
          {
            title: "Agenda",
            path: "/agenda",
            feature: "agenda",
            read: "agenda.read" as const,
          },
          ...Object.values(modules),
        ]
          .filter(
            (m) =>
              enabled(m.feature) && hasPermission(access.membership, m.read),
          )
          .map((m) => {
            const Icon = shortcutIcons[m.path] ?? LayoutGrid;
            return (
              <Link
                key={m.path}
                href={m.path}
                className="flex items-center gap-3 rounded-2xl bg-secondary/50 p-4 text-sm font-medium transition-colors hover:bg-accent"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-card text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <span>{m.title}</span>
              </Link>
            );
          })}
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <section className="space-y-4 rounded-3xl border bg-card p-5">
          <h2 className="font-semibold">Upcoming events</h2>
          {events.length ? (
            events.map((e) => (
              <Link key={e.id} href="/agenda" className="block text-sm">
                <p>{e.title}</p>
                <p className="text-xs text-muted-foreground">
                  {e.startAt.toLocaleString()}
                </p>
              </Link>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No upcoming events.</p>
          )}
        </section>
        <section className="space-y-4 rounded-3xl border bg-card p-5">
          <h2 className="font-semibold">Open tasks</h2>
          {tasks.length ? (
            tasks.map((t) => (
              <Link key={t.id} href="/tasks" className="block text-sm">
                <p>{t.title}</p>
                <p className="text-xs text-muted-foreground">
                  {t.priority}
                  {t.dueAt ? ` · ${t.dueAt.toLocaleDateString()}` : ""}
                </p>
              </Link>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No open tasks.</p>
          )}
        </section>
        <section className="space-y-4 rounded-3xl border bg-card p-5">
          <h2 className="font-semibold">Announcements</h2>
          {announcements.length ? (
            announcements.map((a) => (
              <Link key={a.id} href="/announcements" className="block text-sm">
                {a.title}
                <span className="ml-2 text-xs text-muted-foreground">
                  {a.priority}
                </span>
              </Link>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No announcements.</p>
          )}
        </section>
      </div>
    </div>
  );
}
