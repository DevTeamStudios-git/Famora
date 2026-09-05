import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  endOfDay,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "date-fns";

export const AGENDA_VIEWS = ["day", "week", "month", "year", "schedule"] as const;
export type AgendaView = (typeof AGENDA_VIEWS)[number];

export function isAgendaView(v: string | undefined): v is AgendaView {
  return !!v && (AGENDA_VIEWS as readonly string[]).includes(v);
}

export type WeekStart = 0 | 1;

export interface AgendaRange {
  /** inclusive start of what the user sees */
  start: Date;
  /** exclusive end of what the user sees */
  end: Date;
  /** padded fetch window — month grids show leading/trailing days */
  fetchStart: Date;
  fetchEnd: Date;
  title: string;
}

/** [spec §2] title + range per view */
export function resolveRange(view: AgendaView, anchor: Date, weekStartsOn: WeekStart = 0): AgendaRange {
  switch (view) {
    case "day": {
      const start = startOfDay(anchor);
      return pad({ start, end: addDays(start, 1), title: format(anchor, "MMMM d, yyyy") });
    }
    case "week": {
      const start = startOfWeek(anchor, { weekStartsOn });
      const end = addDays(start, 7);
      const sameMonth = start.getMonth() === addDays(end, -1).getMonth();
      return pad({
        start,
        end,
        title: sameMonth
          ? format(start, "MMMM yyyy")
          : `${format(start, "MMM d")} – ${format(addDays(end, -1), "MMM d, yyyy")}`,
      });
    }
    case "month": {
      const start = startOfWeek(startOfMonth(anchor), { weekStartsOn });
      const end = addDays(endOfWeek(endOfMonth(anchor), { weekStartsOn }), 1);
      return pad({ start, end, title: format(anchor, "MMMM yyyy") });
    }
    case "year":
      return pad({
        start: startOfYear(anchor),
        end: addDays(endOfYear(anchor), 1),
        title: format(anchor, "yyyy"),
      });
    case "schedule": {
      const start = startOfDay(anchor);
      return pad({ start, end: addDays(start, 30), title: format(anchor, "MMMM yyyy") });
    }
  }
}

function pad({ start, end, title }: { start: Date; end: Date; title: string }): AgendaRange {
  // ±1 day covers timezone skew for events authored in other zones
  return { start, end, fetchStart: addDays(start, -1), fetchEnd: addDays(end, 1), title };
}

/** [spec §2] prev/next honours the active view */
export function stepAnchor(view: AgendaView, anchor: Date, dir: -1 | 1): Date {
  switch (view) {
    case "day":
      return addDays(anchor, dir);
    case "week":
      return addWeeks(anchor, dir);
    case "month":
      return addMonths(anchor, dir);
    case "year":
      return addYears(anchor, dir);
    case "schedule":
      return addDays(anchor, dir * 30);
  }
}

/** [spec §3] desktop → day, mobile → schedule */
export function defaultView(isMobile: boolean): AgendaView {
  return isMobile ? "schedule" : "day";
}

export const parseAnchor = (raw: string | undefined): Date => {
  if (!raw) return startOfDay(new Date());
  const d = new Date(`${raw}T00:00:00`);
  return Number.isNaN(d.getTime()) ? startOfDay(new Date()) : d;
};

export const formatAnchor = (d: Date): string => format(d, "yyyy-MM-dd");
export { endOfDay };
