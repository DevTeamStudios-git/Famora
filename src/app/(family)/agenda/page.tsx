import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { getAccessState } from "@/lib/auth/session";
import { hasPermission } from "@/lib/authorization/authorization";
import { getFamilyWithFeatures } from "@/server/queries/family";
import {
  listFamilyEvents,
  listFamilyEventCategories,
  listFamilyMembersForAgenda,
} from "@/server/queries/agenda";
import { EmptyState } from "@/components/core/empty-state";
import { AgendaView } from "@/components/agenda/agenda-view";
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";
import { prisma } from "@/lib/prisma/client";

export const metadata: Metadata = { title: "Family Agenda" };

export default async function AgendaPage() {
  const access = await getAccessState();
  if (access.status !== "authorized") {
    redirect(access.status === "unauthenticated" ? "/login" : "/access-denied");
  }

  const { familyId, memberId, membership } = access;

  const family = await getFamilyWithFeatures(familyId);
  const agendaEnabled = family?.features.has("agenda") ?? true;

  if (!hasPermission(membership, "agenda.read") || !agendaEnabled) {
    return (
      <div className="mt-6">
        <EmptyState
          icon={CalendarDays}
          title={
            agendaEnabled
              ? "No access to Family Agenda"
              : "Family Agenda is disabled"
          }
          description={
            agendaEnabled
              ? "You don't have permission to view the Family Agenda."
              : "A Family Chief or Co-Chief has turned this tool off for now."
          }
        />
      </div>
    );
  }

  // Compute initial date range for the current month
  const now = new Date();
  const start = startOfWeek(startOfMonth(now));
  const end = endOfWeek(endOfMonth(now));

  const [events, categories, members] = await Promise.all([
    listFamilyEvents(familyId, memberId, start, end),
    listFamilyEventCategories(familyId),
    listFamilyMembersForAgenda(familyId),
  ]);
  const preferences = await prisma.familyMemberSettings.findUnique({
    where: { memberId },
    select: { defaultAgendaView: true },
  });

  return (
    <div className="agenda-full-bleed flex flex-1 min-h-0 flex-col">
      <AgendaView
        familyId={familyId}
        memberId={memberId}
        initialEvents={events}
        initialCategories={categories}
        initialMembers={members}
        defaultView={
          (preferences?.defaultAgendaView ?? "month") as
            "day" | "week" | "month" | "year" | "agenda"
        }
        permissions={{
          canCreate: hasPermission(membership, "agenda.event.create"),
          canEditOwn: hasPermission(membership, "agenda.event.update.own"),
          canEditAny: hasPermission(membership, "agenda.event.update.any"),
          canDeleteOwn: hasPermission(membership, "agenda.event.delete.own"),
          canDeleteAny: hasPermission(membership, "agenda.event.delete.any"),
          canManage: hasPermission(membership, "agenda.manage"),
        }}
      />
    </div>
  );
}
