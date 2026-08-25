"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { AgendaEvent, AgendaEventCategory, AgendaMember } from "@/server/queries/agenda";

export function AgendaView({
  _familyId,
  _memberId,
  initialEvents,
  _initialCategories,
  _initialMembers,
}: {
  _familyId: string;
  _memberId: string;
  initialEvents: AgendaEvent[];
  _initialCategories: AgendaEventCategory[];
  _initialMembers: AgendaMember[];
}) {
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 border-b border-border">
        <div className="flex items-center gap-4">
          <span className="text-lg font-medium w-48 text-center">Family Agenda</span>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <Button onClick={() => toast.success("New Event clicked")} className="ml-2">
            <Plus className="mr-1 h-4 w-4" />
            New Event
          </Button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <p className="text-lg">Agenda View - {initialEvents.length} events loaded</p>
          <p className="text-sm mt-2">Month/Week/Day/List views coming soon</p>
        </div>
      </div>
    </div>
  );
}