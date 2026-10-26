"use client";

import * as React from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  ChevronDown,
  Sun,
  LayoutGrid,
  List,
  Calendar,
  Clock,
  MapPin,
  Video,
  MoreHorizontal,
  Home,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  addWeeks,
  addYears,
  startOfDay,
  endOfDay,
  startOfYear,
  endOfYear,
  isSameDay,
  isSameMonth,
  isToday,
} from "date-fns";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { EventEditor } from "@/components/agenda/event-editor";
import { EventDetails } from "@/components/agenda/event-details";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ActionForm } from "@/components/core/action-form";
import type {
  AgendaEvent,
  AgendaEventCategory,
  AgendaMember,
} from "@/server/queries/agenda";
import {
  fetchAgendaRange,
  updateRsvp,
  createEventCategory,
  updateAgendaEvent,
} from "@/server/actions/agenda";
import { packIntervals, blockStyle } from "@/lib/agenda/layout";

type ViewMode = "day" | "week" | "month" | "year" | "agenda";

const SIDEBAR_WIDTH = 280;
const SIDEBAR_COLLAPSED_WIDTH = 56;

export function AgendaView({
  familyId,
  memberId,
  initialEvents,
  initialCategories,
  initialMembers,
  permissions,
  defaultView = "month",
}: {
  familyId: string;
  memberId: string;
  initialEvents: AgendaEvent[];
  initialCategories: AgendaEventCategory[];
  initialMembers: AgendaMember[];
  permissions: {
    canCreate: boolean;
    canEditOwn: boolean;
    canEditAny: boolean;
    canDeleteOwn: boolean;
    canDeleteAny: boolean;
    canManage: boolean;
  };
  defaultView?: ViewMode;
}) {
  const router = useRouter();
  const [view, setView] = React.useState<ViewMode>(defaultView);
  const [currentDate, setCurrentDate] = React.useState(new Date());
  const [events, setEvents] = React.useState<AgendaEvent[]>(initialEvents);
  const categories = initialCategories;
  const members = initialMembers;
  const [selectedEvent, setSelectedEvent] = React.useState<AgendaEvent | null>(
    null,
  );
  const [editingEvent, setEditingEvent] = React.useState<AgendaEvent | null>(
    null,
  );
  const [leftPanelOpen, setLeftPanelOpen] = React.useState(true);
  const [showCreatePopover, setShowCreatePopover] = React.useState(false);
  const [createDate, setCreateDate] = React.useState<Date | null>(null);
  const DEFAULT_CALENDARS: AgendaEventCategory[] = [
    { id: "family-default", familyId, name: "Family", color: "#4285F4" },
    { id: "birthdays-default", familyId, name: "Birthdays", color: "#34A853" },
    { id: "tasks-default", familyId, name: "Tasks", color: "#FBBC05" },
  ];
  const displayCategories =
    categories.length > 0 ? categories : DEFAULT_CALENDARS;
  const [visibleCalendars, setVisibleCalendars] = React.useState<Set<string>>(
    () =>
      new Set(
        (categories.length > 0 ? categories : DEFAULT_CALENDARS).map(
          (c) => c.id,
        ),
      ),
  );

  const [now, setNow] = React.useState(new Date());
  React.useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Mobile: default to Agenda view (time-grid is unusable on small screens)
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(max-width: 767px)");
    const apply = () => {
      if (mql.matches && (view === "day" || view === "week")) {
        setView("agenda");
      }
    };
    apply();
    // only on mount, don't override user choice after
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getDateRange = React.useCallback(() => {
    const date = currentDate;
    switch (view) {
      case "day": {
        const start = startOfDay(date);
        return { start, end: endOfDay(date) };
      }
      case "week": {
        const start = startOfWeek(date, { weekStartsOn: 1 });
        return { start, end: endOfWeek(start, { weekStartsOn: 1 }) };
      }
      case "month": {
        const start = startOfMonth(date);
        return { start, end: endOfMonth(date) };
      }
      case "year": {
        const start = startOfYear(date);
        return { start, end: endOfYear(date) };
      }
      case "agenda": {
        const start = startOfDay(date);
        return { start, end: addDays(start, 30) };
      }
    }
  }, [view, currentDate]);

  const { start: rangeStart, end: rangeEnd } = getDateRange();
  const rangeStartISO = rangeStart.toISOString();
  const rangeEndISO = rangeEnd.toISOString();
  const refreshEvents = React.useCallback(async () => {
    const rows = await fetchAgendaRange(rangeStartISO, rangeEndISO);
    setEvents(rows);
  }, [rangeStartISO, rangeEndISO]);
  React.useEffect(() => {
    let active = true;
    const refresh = () =>
      fetchAgendaRange(rangeStartISO, rangeEndISO)
        .then((rows) => {
          if (active) setEvents(rows);
        })
        .catch(() => {
          if (active) toast.error("Could not load calendar events.");
        });
    void refresh();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [rangeStartISO, rangeEndISO]);
  const openCreate = (date = currentDate) => {
    if (permissions.canCreate) {
      setEditingEvent(null);
      setCreateDate(date);
      setShowCreatePopover(true);
    }
  };
  const canEditEvent = (event: AgendaEvent) =>
    (event.visibility !== "PRIVATE" || event.createdByMemberId === memberId) &&
    (permissions.canEditAny ||
      (event.createdByMemberId === memberId && permissions.canEditOwn));
  const draggedEvent = React.useRef<AgendaEvent | null>(null);
  const moveEvent = async (event: AgendaEvent, start: Date, end: Date) => {
    if (!canEditEvent(event) || event.recurrenceRule) return;
    const before = events;
    setEvents((rows) =>
      rows.map((row) =>
        row.id === event.id
          ? { ...row, startAt: start.toISOString(), endAt: end.toISOString() }
          : row,
      ),
    );
    try {
      const result = await updateAgendaEvent(event.id, {
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        version: event.version,
      });
      if (!result.ok) {
        setEvents(before);
        toast.error(result.error);
      }
      await refreshEvents();
    } catch {
      setEvents(before);
      toast.error("Could not move the event. Please try again.");
    }
  };
  const dropEvent = (day: Date, hour?: number) => (input: React.DragEvent) => {
    input.preventDefault();
    input.stopPropagation();
    const event = draggedEvent.current;
    draggedEvent.current = null;
    if (!event) return;
    const old = new Date(event.startAt);
    const start = new Date(day);
    start.setHours(
      hour ?? old.getHours(),
      hour === undefined ? old.getMinutes() : 0,
      0,
      0,
    );
    void moveEvent(
      event,
      start,
      new Date(
        start.getTime() + new Date(event.endAt).getTime() - old.getTime(),
      ),
    );
  };
  const dragProps = (event: AgendaEvent) => ({
    draggable: canEditEvent(event) && !event.recurrenceRule,
    onDragStart: (input: React.DragEvent) => {
      draggedEvent.current = event;
      input.dataTransfer.setData("text/plain", event.id);
    },
    onDragEnd: () => {
      draggedEvent.current = null;
    },
    role: "group" as const,
    tabIndex: 0,
    "aria-label": event.title,
    onKeyDown: (input: React.KeyboardEvent) => {
      if (input.key === "Enter" || input.key === " ") {
        input.preventDefault();
        setSelectedEvent(event);
      }
    },
  });
  const resizeHandle = (event: AgendaEvent) =>
    canEditEvent(event) && !event.recurrenceRule ? (
      <button
        aria-label={`Resize ${event.title}`}
        title="Drag to resize, or use the up and down arrow keys"
        className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize rounded-b bg-primary/20"
        onClick={(input) => input.stopPropagation()}
        onKeyDown={(input) => {
          input.stopPropagation();
          if (input.key === "ArrowUp" || input.key === "ArrowDown") {
            input.preventDefault();
            const end = new Date(
              new Date(event.endAt).getTime() +
                (input.key === "ArrowDown" ? 15 : -15) * 60000,
            );
            if (end > new Date(event.startAt))
              void moveEvent(event, new Date(event.startAt), end);
          }
        }}
        onPointerDown={(input) => {
          input.stopPropagation();
          input.preventDefault();
          const y = input.clientY;
          window.addEventListener(
            "pointerup",
            (up) => {
              const delta = Math.round((up.clientY - y) / 15) * 15 * 60000;
              const end = new Date(
                Math.max(
                  new Date(event.startAt).getTime() + 15 * 60000,
                  new Date(event.endAt).getTime() + delta,
                ),
              );
              if (delta) void moveEvent(event, new Date(event.startAt), end);
            },
            { once: true },
          );
        }}
      />
    ) : null;
  const placedEvents = (rows: AgendaEvent[], day: Date) =>
    packIntervals(rows, (event) => ({
      start: Math.max(
        new Date(event.startAt).getTime(),
        startOfDay(day).getTime(),
      ),
      end: Math.min(new Date(event.endAt).getTime(), endOfDay(day).getTime()),
    }));

  const visibleEvents = React.useMemo(() => {
    const byCalendar = events.filter((e) => {
      if (categories.length === 0) {
        const effectiveId = e.categoryId ?? "family-default";
        return visibleCalendars.has(effectiveId);
      }
      if (!e.categoryId) return true;
      return visibleCalendars.has(e.categoryId);
    });
    return byCalendar.filter((e) => {
      const eventStart = new Date(e.startAt);
      const eventEnd = new Date(e.endAt);
      return eventStart <= rangeEnd && eventEnd >= rangeStart;
    });
  }, [events, rangeStart, rangeEnd, visibleCalendars, categories.length]);

  const toggleCalendarVisibility = (categoryId: string) => {
    setVisibleCalendars((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  };

  const navigate = (delta: number) => {
    switch (view) {
      case "day":
        setCurrentDate((d) => addDays(d, delta));
        break;
      case "week":
        setCurrentDate((d) => addWeeks(d, delta));
        break;
      case "month":
        setCurrentDate((d) => addMonths(d, delta));
        break;
      case "year":
        setCurrentDate((d) => addYears(d, delta));
        break;
      case "agenda":
        setCurrentDate((d) => addDays(d, delta * 7));
        break;
    }
  };

  const goToToday = () => setCurrentDate(new Date());

  const getEventStyle = (event: AgendaEvent) => {
    const cat = (categories.length > 0 ? categories : DEFAULT_CALENDARS).find(
      (c) => c.id === (event.categoryId ?? "family-default"),
    );
    const color = cat?.color || "#4285F4";
    return { backgroundColor: color + "20", borderLeftColor: color };
  };

  const formatTime = (date: Date | string) => format(new Date(date), "h:mm a");
  const formatHourLabel = (h: number) =>
    format(new Date(0, 0, 0, h, 0, 0, 0), "h a");

  const getEventTop = (date: Date) => {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    return (hours * 60 + minutes) * (60 / 60);
  };

  const renderDayView = () => {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const dayEvents = visibleEvents.filter(
      (e) =>
        !e.allDay &&
        new Date(e.startAt) <= rangeEnd &&
        new Date(e.endAt) > rangeStart,
    );
    const allDayEvents = visibleEvents.filter((e) => e.allDay);

    return (
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden bg-background">
        {allDayEvents.length > 0 && (
          <div className="h-12 shrink-0 border-b border-border bg-muted/30 px-2 flex items-center gap-1 overflow-hidden">
            <span className="text-xs font-medium text-muted-foreground w-16 shrink-0">
              ALL DAY
            </span>
            <div className="flex gap-1 flex-1 overflow-hidden">
              {allDayEvents.map((e) => (
                <div
                  key={e.occurrenceKey ?? e.id}
                  {...dragProps(e)}
                  className="flex-1 min-w-[100px] px-1.5 py-1 rounded text-xs cursor-pointer hover:opacity-80"
                  style={getEventStyle(e)}
                  onClick={() => setSelectedEvent(e)}
                >
                  {e.title}
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-1 min-h-0 overflow-auto [scrollbar-gutter:stable] overscroll-contain rounded-xl border border-border bg-card shadow-sm mx-2 mb-2 sm:mx-3 sm:mb-3">
          <div className="flex w-full min-h-[1440px]">
            <div className="w-[52px] sm:w-[64px] shrink-0 border-r border-border bg-muted/20">
              <div className="h-[24px] border-b border-transparent" />
              {hours.map((h) => (
                <div
                  key={h}
                  className="relative h-[60px] border-b border-border/50 text-[10px] sm:text-xs text-right pr-2 sm:pr-3 text-muted-foreground"
                >
                  <span className="absolute -top-2 right-2 sm:right-3 bg-background px-1 leading-none">
                    {formatHourLabel(h)}
                  </span>
                </div>
              ))}
              <div className="h-[24px]" />
            </div>
            <div className="flex-1 relative min-w-0 bg-background">
              <div className="absolute inset-0">
                {hours.map((h) => (
                  <button
                    key={h}
                    aria-label={`Create event at ${h}:00`}
                    disabled={!permissions.canCreate}
                    onClick={() => {
                      const date = new Date(currentDate);
                      date.setHours(h, 0, 0, 0);
                      openCreate(date);
                    }}
                    className="absolute left-0 right-0 border-t border-border/50 hover:bg-accent/30"
                    onDragOver={(input) => input.preventDefault()}
                    onDrop={dropEvent(currentDate, h)}
                    style={{ top: `${h * 60 + 24}px`, height: "60px" }}
                  />
                ))}
                {isToday(currentDate) && (
                  <div
                    className="absolute left-0 right-0 h-0.5 bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.8)]"
                    style={{ top: `${getEventTop(now) + 24}px` }}
                  >
                    <div className="absolute -left-3 -top-1.5 w-3 h-3 rounded-full bg-red-500 border-2 border-background" />
                  </div>
                )}
                {placedEvents(dayEvents, currentDate).map((placed) => {
                  const e = placed.item;
                  const geometry = blockStyle(
                    placed,
                    startOfDay(currentDate).getTime(),
                    60,
                  );
                  return (
                    <div
                      key={e.occurrenceKey ?? e.id}
                      {...dragProps(e)}
                      className="absolute left-1 right-1 sm:left-2 sm:right-2 rounded px-2 py-1 text-xs cursor-pointer hover:opacity-80 hover:shadow-md transition-all z-10 border-l-2"
                      style={{
                        ...geometry,
                        top: geometry.top + 24,
                        ...getEventStyle(e),
                        borderLeftColor: getEventStyle(e).borderLeftColor,
                      }}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setSelectedEvent(e);
                      }}
                    >
                      <div className="font-medium truncate">{e.title}</div>
                      <div className="text-xs opacity-70">
                        {formatTime(e.startAt)} - {formatTime(e.endAt)}
                      </div>
                      {resizeHandle(e)}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderWeekView = () => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const hours = Array.from({ length: 24 }, (_, i) => i);

    return (
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden bg-background">
        <div className="flex flex-1 min-h-0 overflow-auto [scrollbar-gutter:stable] overscroll-contain">
          <div className="flex w-full min-h-[1440px] min-w-[700px]">
            <div className="w-[52px] sm:w-[64px] shrink-0 border-r border-border bg-muted/20 sticky left-0 z-10">
              <div className="h-24 border-b border-border bg-muted/20" />
              {hours.map((h) => (
                <div
                  key={h}
                  className="relative h-[60px] border-b border-border/50 text-[10px] sm:text-xs text-right pr-2 sm:pr-3 text-muted-foreground bg-muted/20"
                >
                  <span className="absolute -top-2 right-2 sm:right-3 bg-muted/20 px-1 leading-none">
                    {formatHourLabel(h)}
                  </span>
                </div>
              ))}
              <div className="h-[24px]" />
            </div>
            <div className="flex flex-1 min-w-0">
              {days.map((day, d) => {
                const isTodayDay = isToday(day);
                const dayEvents = visibleEvents
                  .filter((e) => {
                    const eventStart = new Date(e.startAt);
                    return (
                      eventStart <= endOfDay(day) &&
                      new Date(e.endAt) > startOfDay(day) &&
                      !e.allDay
                    );
                  })
                  .sort(
                    (a, b) =>
                      new Date(a.startAt).getTime() -
                      new Date(b.startAt).getTime(),
                  );

                return (
                  <div
                    key={d}
                    className={cn(
                      "flex-1 relative border-r border-border min-w-[110px] sm:min-w-[140px] flex flex-col",
                      isTodayDay && "bg-primary/[0.03]",
                    )}
                  >
                    <div
                      className={cn(
                        "h-24 shrink-0 border-b border-border px-2 text-center text-xs sm:text-sm font-medium sticky top-0 bg-background z-10 overflow-y-auto",
                        isTodayDay && "bg-primary/10 text-primary",
                      )}
                    >
                      <div>{format(day, "EEE")}</div>
                      <div className="text-[11px]">{format(day, "d MMM")}</div>
                      {visibleEvents
                        .filter(
                          (e) =>
                            e.allDay &&
                            new Date(e.startAt) <= endOfDay(day) &&
                            new Date(e.endAt) > startOfDay(day),
                        )
                        .map((e) => (
                          <button
                            key={e.occurrenceKey ?? e.id}
                            className="mt-1 block w-full truncate rounded px-1 py-0.5 text-left text-xs"
                            style={getEventStyle(e)}
                            onClick={() => setSelectedEvent(e)}
                          >
                            {e.title}
                          </button>
                        ))}
                    </div>
                    <div className="relative flex-1 min-h-[1440px] bg-background">
                      {hours.map((h) => (
                        <button
                          key={h}
                          aria-label={`Create event ${format(day, "MMM d")} at ${h}:00`}
                          disabled={!permissions.canCreate}
                          onClick={() => {
                            const date = new Date(day);
                            date.setHours(h, 0, 0, 0);
                            openCreate(date);
                          }}
                          className="absolute left-0 right-0 border-b border-border/30 hover:bg-accent/30"
                          style={{ top: `${h * 60 + 24}px`, height: "60px" }}
                          onDragOver={(input) => input.preventDefault()}
                          onDrop={dropEvent(day, h)}
                        />
                      ))}
                      {placedEvents(dayEvents, day).map((placed) => {
                        const e = placed.item;
                        const geometry = blockStyle(
                          placed,
                          startOfDay(day).getTime(),
                          60,
                        );
                        return (
                          <div
                            key={e.occurrenceKey ?? e.id}
                            {...dragProps(e)}
                            className="absolute left-1 right-1 rounded px-1 py-0.5 text-[10px] leading-tight cursor-pointer hover:opacity-80 hover:shadow-sm border-l-2 overflow-hidden"
                            style={{
                              ...geometry,
                              top: geometry.top + 24,
                              ...getEventStyle(e),
                              borderLeftColor: getEventStyle(e).borderLeftColor,
                            }}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setSelectedEvent(e);
                            }}
                          >
                            <div className="font-medium truncate">
                              {e.title}
                            </div>
                            <div className="opacity-70 hidden sm:block">
                              {formatTime(e.startAt)}
                            </div>
                            {resizeHandle(e)}
                          </div>
                        );
                      })}
                      {isTodayDay && (
                        <div
                          className="absolute left-0 right-0 h-0.5 bg-red-500 z-20"
                          style={{ top: `${getEventTop(now) + 24}px` }}
                        >
                          <div className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-red-500" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderMonthView = () => {
    const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
    const weeks: Date[][] = [];
    const current = new Date(start);
    while (current <= end) {
      const week: Date[] = [];
      for (let i = 0; i < 7; i++) {
        week.push(new Date(current));
        current.setDate(current.getDate() + 1);
      }
      weeks.push(week);
    }

    return (
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-7 gap-0.5">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => (
            <div
              key={i}
              className="p-2 text-center text-xs font-medium text-muted-foreground border-b border-border"
            >
              {d}
            </div>
          ))}
          {weeks.map((week, w) => (
            <React.Fragment key={w}>
              {week.map((day, d) => {
                const isCurrentMonth = isSameMonth(day, currentDate);
                const isTodayDay = isToday(day);
                const dayEvents = visibleEvents.filter((e) => {
                  const eventStart = new Date(e.startAt);
                  return (
                    eventStart <= endOfDay(day) &&
                    new Date(e.endAt) > startOfDay(day)
                  );
                });

                return (
                  <div
                    key={d}
                    className={cn(
                      "relative min-h-[100px] p-1 border border-border",
                      !isCurrentMonth && "bg-muted/30",
                      isTodayDay && "bg-primary/5 ring ring-primary",
                      dayEvents.length > 0 && "bg-accent/30",
                    )}
                  >
                    <button
                      onClick={() => openCreate(day)}
                      onDragOver={(input) => input.preventDefault()}
                      onDrop={dropEvent(day)}
                      aria-label={`Create event on ${format(day, "PPP")}`}
                      disabled={!permissions.canCreate}
                      className={cn(
                        "text-xs font-medium",
                        isTodayDay && "text-primary",
                      )}
                    >
                      {format(day, "d")}
                    </button>
                    <div className="mt-1 space-y-1 max-h-[80px] overflow-y-auto">
                      {dayEvents.slice(0, 3).map((e) => (
                        <div
                          key={e.occurrenceKey ?? e.id}
                          {...dragProps(e)}
                          className="text-xs px-1.5 py-0.5 rounded truncate cursor-pointer hover:opacity-80"
                          style={getEventStyle(e)}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setSelectedEvent(e);
                          }}
                        >
                          {e.allDay ? "All day" : formatTime(e.startAt)}{" "}
                          {e.title}
                        </div>
                      ))}
                      {dayEvents.length > 3 && (
                        <div className="text-xs text-center text-muted-foreground">
                          +{dayEvents.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  };

  const renderAgendaView = () => {
    const grouped = new Map<string, AgendaEvent[]>();
    visibleEvents.forEach((e) => {
      const key = format(new Date(e.startAt), "yyyy-MM-dd");
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(e);
    });

    const sortedKeys = Array.from(grouped.keys()).sort();

    if (visibleEvents.length === 0) {
      return (
        <div className="flex-1 overflow-auto space-y-4 p-4">
          <div className="text-center text-muted-foreground py-12">
            <CalendarDays className="mx-auto h-12 w-12 mb-4 opacity-50" />
            <p className="text-lg">No events scheduled</p>
            <p className="text-sm mt-1">
              Click &apos;Create&apos; to add your first event
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex-1 overflow-auto space-y-4 p-4">
        {sortedKeys.map((key) => {
          const dayEvents = grouped.get(key)!;
          return (
            <div key={key} className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <div className="h-px flex-1 bg-border" />
                <span>{format(new Date(key), "EEEE, MMMM d")}</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="space-y-2">
                {dayEvents
                  .sort(
                    (a, b) =>
                      new Date(a.startAt).getTime() -
                      new Date(b.startAt).getTime(),
                  )
                  .map((e) => (
                    <div
                      key={e.occurrenceKey ?? e.id}
                      {...dragProps(e)}
                      className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-accent/50 cursor-pointer"
                      style={{
                        borderLeft: `3px solid ${displayCategories.find((c) => c.id === e.categoryId)?.color || "#4285F4"}`,
                      }}
                      onClick={() => setSelectedEvent(e)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{e.title}</span>
                          {e.allDay && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                              All day
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                          {!e.allDay && (
                            <>
                              <Clock className="h-3.5 w-3.5" />
                              <span>
                                {formatTime(e.startAt)} - {formatTime(e.endAt)}
                              </span>
                            </>
                          )}
                          {e.location && (
                            <>
                              <MapPin className="h-3.5 w-3.5" />
                              <span className="truncate max-w-[200px]">
                                {e.location}
                              </span>
                            </>
                          )}
                          {e.videoCallLink && (
                            <>
                              <Video className="h-3.5 w-3.5" />
                              <span>Video call</span>
                            </>
                          )}
                        </div>
                        {e.description && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {e.description}
                          </p>
                        )}
                      </div>
                      <div
                        className="w-2 rounded-full"
                        style={{
                          backgroundColor:
                            displayCategories.find((c) => c.id === e.categoryId)
                              ?.color || "#4285F4",
                        }}
                      />
                    </div>
                  ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderCurrentView = () => {
    switch (view) {
      case "day":
        return renderDayView();
      case "week":
        return renderWeekView();
      case "month":
        return renderMonthView();
      case "agenda":
        return renderAgendaView();
      case "year":
        return (
          <div className="grid gap-4 overflow-auto p-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from(
              { length: 12 },
              (_, month) => new Date(currentDate.getFullYear(), month, 1),
            ).map((date) => (
              <button
                className="rounded-xl border p-5 text-left hover:bg-accent"
                key={date.toISOString()}
                onClick={() => {
                  setCurrentDate(date);
                  setView("month");
                }}
              >
                <h2 className="font-semibold">{format(date, "MMMM")}</h2>
                <p className="text-sm text-muted-foreground">
                  {
                    events.filter((e) => isSameMonth(new Date(e.startAt), date))
                      .length
                  }{" "}
                  events
                </p>
              </button>
            ))}
          </div>
        );
      default:
        return renderDayView();
    }
  };

  const renderMiniCalendar = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

    const weeks: Date[][] = [];
    const current = new Date(calendarStart);
    while (current <= calendarEnd) {
      const week: Date[] = [];
      for (let i = 0; i < 7; i++) {
        week.push(new Date(current));
        current.setDate(current.getDate() + 1);
      }
      weeks.push(week);
    }

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-medium">
            {format(currentDate, "MMMM yyyy")}
          </span>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentDate(subMonths(currentDate, 1))}
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentDate(addMonths(currentDate, 1))}
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-center">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => (
            <div
              key={i}
              className="text-xs font-medium text-muted-foreground py-1"
            >
              {d}
            </div>
          ))}
          {weeks.map((week, w) => (
            <React.Fragment key={w}>
              {week.map((day, d) => {
                const isCurrentMonth = isSameMonth(day, currentDate);
                const isTodayDay = isToday(day);
                const hasEvents = visibleEvents.some((e) =>
                  isSameDay(new Date(e.startAt), day),
                );

                return (
                  <button
                    key={d}
                    onClick={() => setCurrentDate(day)}
                    className={cn(
                      "aspect-square rounded-lg text-sm font-medium transition-colors",
                      !isCurrentMonth && "text-muted-foreground/50",
                      isTodayDay && "bg-primary text-primary-foreground",
                      hasEvents &&
                        "relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1.5 after:h-1.5 after:rounded-full after:bg-current",
                      "hover:bg-accent",
                    )}
                  >
                    {format(day, "d")}
                  </button>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  };

  const getCurrentDateDisplay = () => {
    switch (view) {
      case "day":
        return format(currentDate, "EEEE, MMMM d, yyyy");
      case "week": {
        const start = startOfWeek(currentDate, { weekStartsOn: 1 });
        const end = endOfWeek(currentDate, { weekStartsOn: 1 });
        return `${format(start, "MMM d")} - ${format(end, "MMM d, yyyy")}`;
      }
      case "month":
        return format(currentDate, "MMMM yyyy");
      case "year":
        return format(currentDate, "yyyy");
      case "agenda":
        return `Next 30 days from ${format(currentDate, "MMM d")}`;
    }
  };

  return (
    <div className="flex h-full flex-col bg-background overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-4 p-2 sm:p-4 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-10 flex-shrink-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 sm:h-10 sm:w-10"
            onClick={() => setLeftPanelOpen(!leftPanelOpen)}
            aria-label="Toggle calendar panel"
          >
            <Calendar className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>
          <div className="hidden sm:flex items-center gap-2">
            <span className="text-base sm:text-lg font-semibold">Famora</span>
            <Separator className="h-6 hidden sm:block" orientation="vertical" />
            <span className="text-base sm:text-lg font-medium text-muted-foreground hidden md:inline">
              Agenda
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 flex-1 justify-center order-last sm:order-none w-full sm:w-auto mt-2 sm:mt-0">
          <div className="flex items-center gap-1 sm:gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={goToToday}
              className="gap-1 h-7 sm:h-9 px-2 sm:px-3 text-xs sm:text-sm"
            >
              <Home className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span>Today</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 sm:h-10 sm:w-10"
              onClick={() => navigate(-1)}
              aria-label="Previous period"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm sm:text-lg font-semibold text-center min-w-[140px] sm:min-w-0 sm:w-56 truncate">
              {getCurrentDateDisplay()}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 sm:h-10 sm:w-10"
              onClick={() => navigate(1)}
              aria-label="Next period"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label="Calendar view"
                variant="outline"
                size="sm"
                className="gap-1 h-7 sm:h-9 px-2 sm:px-3 text-xs sm:text-sm"
              >
                <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">
                  {view.charAt(0).toUpperCase() + view.slice(1)}
                </span>
                <span className="sm:hidden">
                  {view.charAt(0).toUpperCase()}
                </span>
                <ChevronDown className="h-3 w-3 sm:h-4 sm:w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-40" align="end">
              {(["day", "week", "month", "year", "agenda"] as ViewMode[]).map(
                (v) => (
                  <DropdownMenuItem
                    key={v}
                    onSelect={() => setView(v)}
                    className={view === v ? "bg-accent" : ""}
                  >
                    {v === "day" && <Sun className="mr-2 h-4 w-4" />}
                    {v === "week" && <LayoutGrid className="mr-2 h-4 w-4" />}
                    {v === "month" && <CalendarDays className="mr-2 h-4 w-4" />}
                    {v === "year" && <Calendar className="mr-2 h-4 w-4" />}
                    {v === "agenda" && <List className="mr-2 h-4 w-4" />}
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </DropdownMenuItem>
                ),
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            aria-label="Create event"
            disabled={!permissions.canCreate}
            onClick={() => openCreate()}
            className="gap-1 sm:gap-2 bg-primary text-primary-foreground hover:bg-primary/90 h-7 sm:h-9 px-2 sm:px-4 text-xs sm:text-sm"
          >
            <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Create</span>
            <span className="sm:hidden">Create</span>
          </Button>
        </div>
      </div>
      <div className="flex-1 flex overflow-hidden">
        <aside
          className={cn(
            "hidden lg:flex flex-col border-r border-border bg-sidebar flex-shrink-0 transition-all duration-200",
            leftPanelOpen
              ? `w-[${SIDEBAR_WIDTH}px]`
              : `w-[${SIDEBAR_COLLAPSED_WIDTH}px]`,
          )}
          style={{
            width: leftPanelOpen
              ? `${SIDEBAR_WIDTH}px`
              : `${SIDEBAR_COLLAPSED_WIDTH}px`,
          }}
        >
          <div className="flex-1 flex flex-col overflow-y-auto p-3 space-y-4">
            {leftPanelOpen && renderMiniCalendar()}

            {leftPanelOpen && (
              <div className="space-y-2 pt-2 border-t border-border">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-2">
                  Family Calendars
                </h3>
                <div className="space-y-1">
                  {displayCategories.map((cat) => (
                    <label
                      key={cat.id}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={visibleCalendars.has(cat.id)}
                        onChange={() => toggleCalendarVisibility(cat.id)}
                        className="h-4 w-4 text-primary border-border rounded"
                      />
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: cat.color }}
                      />
                      {!leftPanelOpen ? null : (
                        <span className="truncate text-sm">{cat.name}</span>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {leftPanelOpen && permissions.canManage && (
              <details>
                <summary className="cursor-pointer text-sm text-primary">
                  Add calendar
                </summary>
                <ActionForm
                  action={async (form) => {
                    const result = await createEventCategory(
                      String(form.get("name")),
                      String(form.get("color")),
                    );
                    if (!result.ok) return { error: result.error };
                    router.refresh();
                    return { success: "Calendar added." };
                  }}
                >
                  <label className="block text-sm">
                    Name
                    <Input name="name" required maxLength={80} />
                  </label>
                  <label className="block text-sm">
                    Color
                    <Input name="color" type="color" defaultValue="#4285F4" />
                  </label>
                </ActionForm>
              </details>
            )}
          </div>

          {!leftPanelOpen && (
            <div className="flex items-center justify-center h-16 border-t border-border">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setLeftPanelOpen(true)}
                aria-label="Expand calendar panel"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
          )}
        </aside>

        <div className="flex-1 flex flex-col min-w-0">
          <main className="flex-1 flex flex-col min-w-0 w-full">
            <div className="flex-1 w-full min-w-0">{renderCurrentView()}</div>
          </main>
        </div>

        <aside className="hidden lg:block w-80 border-l border-border bg-card flex-shrink-0">
          {selectedEvent && (
            <div className="flex-1 flex flex-col overflow-y-auto p-4 space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold truncate">
                    {selectedEvent.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {selectedEvent.allDay
                      ? "All day"
                      : `${formatTime(selectedEvent.startAt)} - ${formatTime(selectedEvent.endAt)}`}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <MoreHorizontal className="h-5 w-5" />
                </button>
              </div>
              <Separator />
              <div className="space-y-3 text-sm">
                {selectedEvent.location && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    <span>{selectedEvent.location}</span>
                  </div>
                )}
                {selectedEvent.videoCallLink && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Video className="h-4 w-4" />
                    <a
                      href={selectedEvent.videoCallLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      Join video call
                    </a>
                  </div>
                )}
                {selectedEvent.description && (
                  <div className="pt-2 border-t border-border">
                    <p className="text-sm text-muted-foreground">
                      {selectedEvent.description}
                    </p>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{
                      backgroundColor:
                        displayCategories.find(
                          (c) => c.id === selectedEvent.categoryId,
                        )?.color || "#4285F4",
                    }}
                  />
                  <span className="text-sm text-muted-foreground">
                    {
                      displayCategories.find(
                        (c) => c.id === selectedEvent.categoryId,
                      )?.name
                    }
                  </span>
                </div>
              </div>
              <div className="flex gap-2 pt-2 border-t border-border">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setSelectedEvent(null)}
                >
                  Close
                </Button>
                {canEditEvent(selectedEvent) && (
                  <Button
                    variant="default"
                    onClick={() => {
                      setEditingEvent(selectedEvent);
                      setShowCreatePopover(true);
                    }}
                  >
                    Edit
                  </Button>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>
      <Dialog open={showCreatePopover} onOpenChange={setShowCreatePopover}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editingEvent ? "Edit event" : "New event"}
            </DialogTitle>
          </DialogHeader>
          <EventEditor
            key={editingEvent?.id ?? createDate?.toISOString() ?? "new"}
            event={editingEvent}
            date={createDate ?? currentDate}
            categories={categories}
            members={members}
            canDelete={
              !!editingEvent &&
              (permissions.canDeleteAny ||
                (permissions.canDeleteOwn &&
                  editingEvent.createdByMemberId === memberId))
            }
            onSaved={() => {
              setShowCreatePopover(false);
              setSelectedEvent(null);
              void refreshEvents();
              router.refresh();
            }}
          />
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!selectedEvent}
        onOpenChange={(open) => {
          if (!open) setSelectedEvent(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedEvent?.title}</DialogTitle>
          </DialogHeader>
          {selectedEvent && (
            <div className="space-y-4">
              <p className="text-sm">
                {format(new Date(selectedEvent.startAt), "PPpp")} –{" "}
                {format(new Date(selectedEvent.endAt), "PPpp")}
              </p>
              <p className="whitespace-pre-wrap text-sm">
                {selectedEvent.description}
              </p>
              <p className="text-sm">{selectedEvent.location}</p>
              <div className="flex flex-wrap gap-2">
                {(["YES", "NO", "MAYBE"] as const).map((rsvp) => (
                  <Button
                    key={rsvp}
                    variant="outline"
                    onClick={async () => {
                      const result = await updateRsvp(selectedEvent.id, rsvp);
                      if (!result.ok) toast.error(result.error);
                      else {
                        toast.success("Response saved.");
                        void refreshEvents();
                      }
                    }}
                  >
                    {rsvp === "YES"
                      ? "Going"
                      : rsvp === "NO"
                        ? "Not going"
                        : "Maybe"}
                  </Button>
                ))}
              </div>
              {canEditEvent(selectedEvent) && (
                <Button
                  onClick={() => {
                    setEditingEvent(selectedEvent);
                    setSelectedEvent(null);
                    setShowCreatePopover(true);
                  }}
                >
                  Edit event
                </Button>
              )}
              <EventDetails
                key={selectedEvent.id}
                eventId={selectedEvent.id}
                canEdit={canEditEvent(selectedEvent)}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>{" "}
    </div>
  );
}
