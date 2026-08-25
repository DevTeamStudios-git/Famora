import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { getAccessState } from "@/lib/auth/session";
import { hasPermission } from "@/lib/authorization/authorization";
import { getFamilyWithFeatures } from "@/server/queries/family";
import { listFamilyEvents, listFamilyEventCategories, listFamilyMembersForAgenda } from "@/server/queries/agenda";
import { PageHeader } from "@/components/core/page-header";
import { EmptyState } from "@/components/core/empty-state";
import { AgendaView } from "@/components/agenda/agenda-view";
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";

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
      <>
        <PageHeader title="Family Agenda" description="Shared family calendar with day, week, month and list views." />
        <div className="mt-6">
          <EmptyState
            icon={CalendarDays}
            title={agendaEnabled ? "No access to Family Agenda" : "Family Agenda is disabled"}
            description={
              agendaEnabled
                ? "You don't have permission to view the Family Agenda."
                : "A Family Chief or Co-Chief has turned this tool off for now."
            }
          />
        </div>
      </>
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

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader title="Family Agenda" description="Shared family calendar with day, week, month and list views." />
      <AgendaView
        _familyId={familyId}
        _memberId={memberId}
        initialEvents={events}
        _initialCategories={categories}
        _initialMembers={members}
      />
    </div>
  );
}