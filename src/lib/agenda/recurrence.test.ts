import { describe, expect, it } from "vitest";
import { expandEvents, type EventRow } from "@/lib/agenda/recurrence";
const event: EventRow = {
  id: "event",
  calendarId: null,
  title: "Dinner",
  startAt: new Date("2026-10-25T22:00:00Z"),
  endAt: new Date("2026-10-25T23:00:00Z"),
  isAllDay: false,
  timeZone: "America/Toronto",
  recurrenceRule: "FREQ=WEEKLY;COUNT=4",
  recurrenceEndsAt: null,
  recurrenceExceptions: [],
  recurrenceParentId: null,
  recurrenceInstanceAt: null,
  status: "CONFIRMED",
  version: 1,
};
describe("calendar recurrence", () => {
  it("keeps local event time stable across daylight saving", () => {
    const occurrences = expandEvents(
      [event],
      new Date("2026-10-25"),
      new Date("2026-11-20"),
    );
    expect(occurrences).toHaveLength(4);
    expect(
      occurrences.map((o) =>
        new Intl.DateTimeFormat("en", {
          timeZone: "America/Toronto",
          hour: "numeric",
          hour12: false,
        }).format(o.start),
      ),
    ).toEqual(["18", "18", "18", "18"]);
    expect(occurrences[1].start.toISOString()).toBe("2026-11-01T23:00:00.000Z");
  });
  it("omits excluded occurrences", () => {
    const occurrences = expandEvents(
      [{ ...event, recurrenceExceptions: [new Date("2026-11-01T23:00:00Z")] }],
      new Date("2026-10-25"),
      new Date("2026-11-20"),
    );
    expect(occurrences).toHaveLength(3);
  });
  it("shows events spanning the queried day", () => {
    const occurrences = expandEvents(
      [
        {
          ...event,
          recurrenceRule: null,
          startAt: new Date("2026-10-24"),
          endAt: new Date("2026-10-27"),
        },
      ],
      new Date("2026-10-25"),
      new Date("2026-10-26"),
    );
    expect(occurrences).toHaveLength(1);
  });
  it("skips cancelled and malformed recurring events", () => {
    expect(
      expandEvents(
        [
          { ...event, status: "CANCELLED" },
          { ...event, id: "bad", recurrenceRule: "bad input" },
        ],
        new Date("2026-10-25"),
        new Date("2026-11-20"),
      ),
    ).toEqual([]);
  });
});
