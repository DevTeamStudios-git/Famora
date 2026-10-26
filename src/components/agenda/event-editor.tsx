"use client";
import { ActionForm } from "@/components/core/action-form";
import { FormField } from "@/components/core/workspace";
import {
  createAgendaEvent,
  updateAgendaEvent,
  deleteAgendaEvent,
} from "@/server/actions/agenda";
import type {
  AgendaEvent,
  AgendaEventCategory,
  AgendaMember,
} from "@/server/queries/agenda";
import type { Field } from "@/lib/workspace";

export function EventEditor({
  event,
  date,
  categories,
  members,
  onSaved,
  canDelete,
}: {
  event?: AgendaEvent | null;
  date: Date;
  categories: AgendaEventCategory[];
  members: AgendaMember[];
  onSaved: () => void;
  canDelete: boolean;
}) {
  const fields: Field[] = [
    { name: "title", label: "Title", required: true },
    { name: "startAt", label: "Start", type: "datetime-local", required: true },
    { name: "endAt", label: "End", type: "datetime-local", required: true },
    { name: "allDay", label: "All day", type: "checkbox" },
    { name: "description", label: "Description", type: "textarea" },
    { name: "location", label: "Location" },
    { name: "videoCallLink", label: "Video call link", type: "url" },
    { name: "visibility", label: "Visibility", options: ["FAMILY", "PRIVATE"] },
    { name: "recurrenceRule", label: "Repeat (e.g. FREQ=WEEKLY;COUNT=12)" },
  ];
  const start = new Date(date);
  start.setMinutes(0, 0, 0);
  const values: Record<string, string | boolean> = event
    ? {
        title: event.title,
        startAt: event.seriesStartAt ?? event.startAt,
        endAt: event.seriesEndAt ?? event.endAt,
        allDay: event.allDay,
        description: event.description ?? "",
        location: event.location ?? "",
        videoCallLink: event.videoCallLink ?? "",
        visibility: event.visibility,
        recurrenceRule: event.recurrenceRule ?? "",
      }
    : {
        startAt: start.toISOString(),
        endAt: new Date(start.getTime() + 3600000).toISOString(),
      };
  return (
    <div className="space-y-4">
      <ActionForm
        action={async (form) => {
          const startAt = new Date(String(form.get("startAt")));
          const endAt = new Date(String(form.get("endAt")));
          if (
            !Number.isFinite(startAt.getTime()) ||
            !Number.isFinite(endAt.getTime())
          )
            return { error: "Choose start and end times." };
          const input = {
            version: event?.version,
            title: String(form.get("title")),
            startAt: startAt.toISOString(),
            endAt: endAt.toISOString(),
            allDay: form.get("allDay") === "on",
            description: String(form.get("description") ?? "") || null,
            location: String(form.get("location") ?? "") || null,
            videoCallLink: String(form.get("videoCallLink") ?? "") || null,
            visibility: String(form.get("visibility")),
            categoryId: String(form.get("categoryId") ?? "") || null,
            recurrenceRule: String(form.get("recurrenceRule") ?? "") || null,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            attendeeIds: form.getAll("attendeeIds").map(String),
            reminders: form.get("reminder")
              ? [{ minutesBefore: Number(form.get("reminder")) }]
              : [],
          };
          const result = event
            ? await updateAgendaEvent(event.id, input)
            : await createAgendaEvent(input);
          if (!result.ok) return { error: result.error };
          onSaved();
          return { success: "Event saved." };
        }}
      >
        {event?.recurrenceRule && (
          <p className="text-sm text-muted-foreground">
            Changes apply to the entire series.
          </p>
        )}
        {fields.map((field) => (
          <FormField
            key={field.name}
            field={field}
            value={values[field.name]}
          />
        ))}
        <label className="block space-y-2 text-sm">
          Calendar
          <select
            name="categoryId"
            defaultValue={event?.categoryId ?? ""}
            className="h-9 w-full rounded-md border bg-background px-3"
          >
            <option value="">Family</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Invite family members</legend>
          {members.map((m) => (
            <label key={m.id} className="flex items-center gap-2 text-sm">
              <input
                name="attendeeIds"
                type="checkbox"
                value={m.id}
                defaultChecked={event?.attendees.some(
                  (a) => a.memberId === m.id,
                )}
              />
              {m.displayName}
            </label>
          ))}
        </fieldset>
        <label className="block space-y-2 text-sm">
          Reminder
          <select
            name="reminder"
            defaultValue={event?.reminders[0]?.minutesBefore ?? ""}
            className="h-9 w-full rounded-md border bg-background px-3"
          >
            <option value="">None</option>
            {[5, 15, 30, 60, 1440].map((n) => (
              <option key={n} value={n}>
                {n} minutes before
              </option>
            ))}
          </select>
        </label>
      </ActionForm>
      {event && canDelete && (
        <details>
          <summary className="cursor-pointer text-sm text-destructive">
            Delete {event.recurrenceRule ? "entire series" : "event"}
          </summary>
          <ActionForm
            action={async () => {
              const result = await deleteAgendaEvent(event.id);
              if (!result.ok) return { error: result.error };
              onSaved();
              return { success: "Event deleted." };
            }}
            submit="Confirm delete"
          />
        </details>
      )}
    </div>
  );
}
