import { RRule, rrulestr } from "rrule";

export interface EventRow {
  id: string;
  calendarId: string | null;
  categoryId?: string | null;
  title: string;
  startAt: Date;
  endAt: Date;
  // compat with both old (startAt/endAt) and new (startsAt/endsAt) naming
  startsAt?: Date;
  endsAt?: Date;
  isAllDay: boolean;
  timeZone: string;
  recurrenceRule: string | null;
  recurrenceEndsAt: Date | null;
  recurrenceExceptions: Date[];
  recurrenceParentId: string | null;
  recurrenceInstanceAt: Date | null;
  status: string;
  version: number;
}

/** A concrete thing drawn on the grid. */
export interface Occurrence<T extends EventRow = EventRow> {
  /** stable per-instance key: `${eventId}:${instanceISO}` */
  key: string;
  eventId: string;
  /** master id if this came from a series */
  seriesId: string | null;
  /** the series slot this occupies (null for one-offs) */
  instanceAt: Date | null;
  start: Date;
  end: Date;
  isRecurring: boolean;
  isOverride: boolean;
  event: T;
}

const occurrenceKey = (eventId: string, at: Date | null): string =>
  `${eventId}:${at ? at.toISOString() : "single"}`;

/**
 * rrule computes in "floating UTC". We shift dtstart by the zone offset,
 * generate, then shift back — which keeps a 6 PM weekly dinner at 6 PM local
 * across a DST boundary instead of drifting to 5 PM.
 */
function zoneOffsetMs(date: Date, timeZone: string): number {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]));
    const asUtc = Date.UTC(
      Number(p.year),
      Number(p.month) - 1,
      Number(p.day),
      Number(p.hour === "24" ? "0" : p.hour),
      Number(p.minute),
      Number(p.second),
    );
    return asUtc - date.getTime();
  } catch {
    return 0;
  }
}

const toFloating = (d: Date, tz: string): Date => new Date(d.getTime() + zoneOffsetMs(d, tz));
const fromFloating = (d: Date, tz: string): Date => {
  // two-pass: offset depends on the resolved instant
  const guess = new Date(d.getTime() - zoneOffsetMs(d, tz));
  return new Date(d.getTime() - zoneOffsetMs(guess, tz));
};

const sameInstant = (a: Date, b: Date): boolean => a.getTime() === b.getTime();

function getStart(e: EventRow): Date {
  return (e.startsAt as Date) ?? e.startAt;
}
function getEnd(e: EventRow): Date {
  return (e.endsAt as Date) ?? e.endAt;
}

/**
 * Expand a mixed list of masters, one-offs and overrides into the occurrences
 * that intersect [windowStart, windowEnd).
 */
export function expandEvents<T extends EventRow>(
  rows: readonly T[],
  windowStart: Date,
  windowEnd: Date,
): Occurrence<T>[] {
  const overridesBySeries = new Map<string, T[]>();
  const bases: T[] = [];

  for (const row of rows) {
    if (row.recurrenceParentId && row.recurrenceInstanceAt) {
      const list = overridesBySeries.get(row.recurrenceParentId) ?? [];
      list.push(row);
      overridesBySeries.set(row.recurrenceParentId, list);
    } else {
      bases.push(row);
    }
  }

  const out: Occurrence<T>[] = [];

  for (const base of bases) {
    const s = getStart(base);
    const e = getEnd(base);
    const durationMs = e.getTime() - s.getTime();

    // --- one-off -----------------------------------------------------------
    if (!base.recurrenceRule) {
      if (e > windowStart && s < windowEnd && base.status !== "CANCELLED") {
        out.push({
          key: occurrenceKey(base.id, null),
          eventId: base.id,
          seriesId: null,
          instanceAt: null,
          start: s,
          end: e,
          isRecurring: false,
          isOverride: false,
          event: base,
        });
      }
      continue;
    }

    // --- series ------------------------------------------------------------
    const tz = base.isAllDay ? "UTC" : base.timeZone;
    let rule: RRule;
    try {
      rule = rrulestr(base.recurrenceRule, {
        dtstart: toFloating(s, tz),
        forceset: false,
      }) as RRule;
    } catch {
      continue; // malformed rule must not take the whole agenda down
    }

    const overrides = overridesBySeries.get(base.id) ?? [];
    const overriddenSlots = overrides.map((o) => o.recurrenceInstanceAt).filter(Boolean) as Date[];

    // widen the query by the duration so an event that *started* before the
    // window but still overlaps it is included
    const queryStart = new Date(windowStart.getTime() - durationMs);
    const slots = rule.between(toFloating(queryStart, tz), toFloating(windowEnd, tz), true);

    for (const floating of slots) {
      const start = base.isAllDay ? floating : fromFloating(floating, tz);
      if (base.recurrenceExceptions.some((ex) => sameInstant(ex, start))) continue;
      if (overriddenSlots.some((slot) => sameInstant(slot, start))) continue;

      const end = new Date(start.getTime() + durationMs);
      if (end <= windowStart || start >= windowEnd) continue;

      out.push({
        key: occurrenceKey(base.id, start),
        eventId: base.id,
        seriesId: base.id,
        instanceAt: start,
        start,
        end,
        isRecurring: true,
        isOverride: false,
        event: base,
      });
    }

    // overrides are drawn from their own row's times
    for (const ov of overrides) {
      const ovS = getStart(ov);
      const ovE = getEnd(ov);
      if (ov.status === "CANCELLED") continue;
      if (ovE <= windowStart || ovS >= windowEnd) continue;
      out.push({
        key: occurrenceKey(base.id, ov.recurrenceInstanceAt!),
        eventId: ov.id,
        seriesId: base.id,
        instanceAt: ov.recurrenceInstanceAt,
        start: ovS,
        end: ovE,
        isRecurring: true,
        isOverride: true,
        event: ov,
      });
    }
  }

  return out.sort(
    (a, b) => a.start.getTime() - b.start.getTime() || a.end.getTime() - b.end.getTime(),
  );
}

/** UNTIL immediately before `instanceAt` — used by "this and following". */
export function truncateRuleBefore(rule: string, instanceAt: Date, timeZone: string): string {
  const until = new Date(toFloating(instanceAt, timeZone).getTime() - 60_000);
  const stamp = `${until.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
  const cleaned = rule.replace(/;?UNTIL=[^;]*/i, "").replace(/;?COUNT=[^;]*/i, "");
  return `${cleaned};UNTIL=${stamp}`.replace(/RRULE:;/, "RRULE:");
}

/** Cache the last possible instance so range queries can prune masters. */
export function computeRecurrenceEnd(
  rule: string,
  dtstart: Date,
  timeZone: string,
  durationMs: number,
): Date | null {
  try {
    const r = rrulestr(rule, { dtstart: toFloating(dtstart, timeZone) }) as RRule;
    const all = r.options.until || r.options.count ? r.all() : null;
    if (!all || all.length === 0) return null; // infinite
    const last = all[all.length - 1] as unknown as Date;
    return new Date(fromFloating(last, timeZone).getTime() + durationMs);
  } catch {
    return null;
  }
}
