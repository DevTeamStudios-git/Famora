"use client";

import * as React from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  ChevronDown,
  Sun,
  Moon,
  LayoutGrid,
  List,
  Calendar,
  Clock,
  MapPin,
  Video,
  Users,
  Bell,
  MoreHorizontal,
  Home,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, subDays, addMonths, subMonths, addWeeks, subWeeks, addYears, subYears, startOfDay, endOfDay, startOfYear, endOfYear, isSameDay, isSameMonth, isToday, isWithinInterval, differenceInMinutes, parseISO, startOfHour } from "date-fns";
import { toast } from "sonner";
import type { AgendaEvent, AgendaEventCategory, AgendaMember } from "@/server/queries/agenda";
import { createAgendaEvent, updateAgendaEvent, deleteAgendaEvent } from "@/server/actions/agenda";

type ViewMode = "day" | "week" | "month" | "year" | "agenda";

const CALENDAR_COLORS = [
  "#4285F4",
  "#EA4335",
  "#FBBC05",
  "#34A853",
  "#A142F4",
  "#FF6D01",
  "#00ACC1",
  "#E91E63",
];

function getRandomColor(): string {
  return CALENDAR_COLORS[Math.floor(Math.random() * CALENDAR_COLORS.length)];
}

const SIDEBAR_WIDTH = 280;
const SIDEBAR_COLLAPSED_WIDTH = 56;
const TIME_GUTTER_WIDTH = 60;

export function AgendaView({
  familyId,
  memberId,
  initialEvents,
  initialCategories,
  initialMembers,
}: {
  familyId: string;
  memberId: string;
  initialEvents: AgendaEvent[];
  initialCategories: AgendaEventCategory[];
  initialMembers: AgendaMember[];
}) {
  const [view, setView] = React.useState<ViewMode>("day");
  const [currentDate, setCurrentDate] = React.useState(new Date());
  const [events, setEvents] = React.useState<AgendaEvent[]>(initialEvents);
  const [categories, setCategories] = React.useState<AgendaEventCategory[]>(initialCategories);
  const [members, setMembers] = React.useState<AgendaMember[]>(initialMembers);
  const [selectedEvent, setSelectedEvent] = React.useState<AgendaEvent | null>(null);
  const [eventDialogOpen, setEventDialogOpen] = React.useState(false);
  const [leftPanelOpen, setLeftPanelOpen] = React.useState(true);
  const [showCreatePopover, setShowCreatePopover] = React.useState(false);
  const [createPopoverPosition, setCreatePopoverPosition] = React.useState<{ x: number; y: number; date: Date } | null>(null);
  const DEFAULT_CALENDARS: AgendaEventCategory[] = [
    { id: "family-default", familyId, name: "Family", color: "#4285F4" },
    { id: "birthdays-default", familyId, name: "Birthdays", color: "#34A853" },
    { id: "tasks-default", familyId, name: "Tasks", color: "#FBBC05" },
  ];
  const displayCategories = categories.length > 0 ? categories : DEFAULT_CALENDARS;
  const [visibleCalendars, setVisibleCalendars] = React.useState<Set<string>>(
    () => new Set((categories.length > 0 ? categories : DEFAULT_CALENDARS).map((c) => c.id))
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
    const cat = (categories.length > 0 ? categories : DEFAULT_CALENDARS).find((c) => c.id === (event.categoryId ?? "family-default"));
    const color = cat?.color || getRandomColor();
    return { backgroundColor: color + "20", borderLeftColor: color };
  };

  const formatTime = (date: Date | string) => format(new Date(date), "h:mm a");
  const formatHourLabel = (h: number) => format(new Date(0, 0, 0, h, 0, 0, 0), "h a");

  const getEventTop = (date: Date) => {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    return (hours * 60 + minutes) * (60 / 60);
  };

  const getEventHeight = (start: Date, end: Date) => {
    const diff = differenceInMinutes(end, start);
    return Math.max(24, diff * (60 / 60));
  };

  const renderDayView = () => {
    const hours = Array.from({ length: 18 }, (_, i) => i + 6);
    const dayEvents = visibleEvents.filter((e) => !e.allDay && isWithinInterval(new Date(e.startAt), { start: rangeStart, end: rangeEnd }));
    const allDayEvents = visibleEvents.filter((e) => e.allDay);

    return (
      <div className="flex h-full overflow-hidden">
        <div className="flex-shrink-0 w-[52px] sm:w-[64px] border-r border-border bg-muted/20 flex-shrink-0">
          <div className="h-12 border-b border-border" />
          {hours.map((h) => (
            <div key={h} className="relative h-[60px] sm:h-[60px] border-b border-border/50 text-[10px] sm:text-xs text-right pr-2 sm:pr-3 text-muted-foreground" style={{ height: "60px" }}>
              <span className="absolute -top-2 right-2 sm:right-3 bg-muted/30 px-1 leading-none">{formatHourLabel(h)}</span>
            </div>
          ))}
        </div>
        <div className="flex-1 relative min-w-0 overflow-auto">
          {allDayEvents.length > 0 && (
            <div className="h-12 border-b border-border bg-muted/30 px-2 overflow-x-auto">
              <div className="flex items-center gap-1 h-full">
                <span className="text-xs font-medium text-muted-foreground w-16 shrink-0">ALL DAY</span>
                <div className="flex gap-1 flex-1">
                  {allDayEvents.map((e) => (
                    <div key={e.id} className="flex-1 min-w-[100px] px-1.5 py-1 rounded text-xs cursor-pointer hover:opacity-80" style={getEventStyle(e)} onClick={() => setSelectedEvent(e)}>
                      {e.title}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div className="relative" style={{ height: `${18 * 60}px` }}>
            {hours.map((h) => (
              <div key={h} className="absolute left-0 right-0 border-t border-border/50" style={{ top: `${(h - 6) * 60}px` }} />
            ))}
            {isToday(currentDate) && (
              <div className="absolute left-0 right-0 h-0.5 bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.8)]" style={{ top: `${getEventTop(now)}px` }}>
                <div className="absolute -left-3 -top-1.5 w-3 h-3 rounded-full bg-red-500 border-2 border-background" />
              </div>
            )}
            {dayEvents
              .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
              .map((e) => {
                const start = new Date(e.startAt);
                const end = new Date(e.endAt);
                const top = getEventTop(start);
                const height = getEventHeight(start, end);
                return (
                  <div key={e.id} className="absolute left-1 right-1 rounded px-2 py-1 text-xs cursor-pointer hover:opacity-80 hover:shadow-md transition-all z-10" style={{ top: `${top}px`, height: `${height}px`, ...getEventStyle(e) }} onClick={(ev) => { ev.stopPropagation(); setSelectedEvent(e); }}>
                    <div className="font-medium truncate">{e.title}</div>
                    <div className="text-xs opacity-70">{formatTime(e.startAt)} - {formatTime(e.endAt)}</div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    );
  };

  const renderWeekView = () => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const hours = Array.from({ length: 18 }, (_, i) => i + 6);

    return (
      <div className="flex flex-1 overflow-auto">
        <div className="flex-shrink-0 w-[52px] sm:w-[64px] border-r border-border bg-muted/30 flex-shrink-0">
          <div className="h-12 border-b border-border" />
          {hours.map((h) => (
            <div key={h} className="relative h-[60px] border-b border-border/50 text-[10px] sm:text-xs text-right pr-2 sm:pr-3 text-muted-foreground" style={{ height: "60px" }}>
              <span className="absolute -top-2 right-2 sm:right-3 bg-muted/30 px-1 leading-none">{formatHourLabel(h)}</span>
            </div>
          ))}
        </div>
        <div className="flex-1 flex overflow-x-auto min-w-0">
          {days.map((day, d) => {
            const isTodayDay = isToday(day);
            const dayEvents = visibleEvents.filter((e) => {
              const eventStart = new Date(e.startAt);
              return isSameDay(eventStart, day) && !e.allDay;
            }).sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
            const allDayEvents = visibleEvents.filter((e) => e.allDay && isSameDay(new Date(e.startAt), day));

            return (
              <div key={d} className={cn("flex-1 relative border-r border-border min-w-[140px]", isTodayDay && "bg-primary/5")}>
                <div className={cn("h-12 border-b border-border px-2 text-center text-sm font-medium", isTodayDay && "bg-primary/10 text-primary")}>
                  {format(day, "EEE d MMM")}
                </div>
                <div className="h-12 border-b border-border px-1 overflow-x-auto">
                  {allDayEvents.map((e) => (
                    <div key={e.id} className="px-1.5 py-1 rounded text-xs cursor-pointer hover:opacity-80" style={getEventStyle(e)} onClick={() => setSelectedEvent(e)}>
                      {e.title}
                    </div>
                  ))}
                </div>
                <div className="relative flex-1" style={{ height: `${18 * 60}px` }}>
                  {hours.map((h) => (
                    <div key={h} className="w-full border-b border-border/50" style={{ height: "60px" }} />
                  ))}
                  {dayEvents.map((e) => {
                    const start = new Date(e.startAt);
                    const end = new Date(e.endAt);
                    const top = getEventTop(start);
                    const height = getEventHeight(start, end);
                    return (
                      <div key={e.id} className="absolute left-1 right-1 rounded px-1 py-0.5 text-[10px] cursor-pointer hover:opacity-80 hover:shadow-sm" style={{ top: `${top}px`, height: `${height}px`, ...getEventStyle(e) }} onClick={(ev) => { ev.stopPropagation(); setSelectedEvent(e); }}>
                        <div className="font-medium truncate">{e.title}</div>
                        <div className="opacity-70">{formatTime(e.startAt)} - {formatTime(e.endAt)}</div>
                      </div>
                    );
                  })}
                  {allDayEvents.map((e) => (
                    <div key={e.id} className="absolute top-1 left-1 right-1 rounded px-1 py-0.5 text-xs cursor-pointer hover:opacity-80" style={getEventStyle(e)} onClick={(ev) => { ev.stopPropagation(); setSelectedEvent(e); }}>
                      {e.title}
                    </div>
                  ))}
                  {isTodayDay && (
                    <div className="absolute left-0 right-0 h-0.5 bg-red-500" style={{ top: `${getEventTop(now)}px` }}>
                      <div className="absolute -left-3 -top-1.5 w-3 h-3 rounded-full bg-red-500 border-2 border-background" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
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
            <div key={i} className="p-2 text-center text-xs font-medium text-muted-foreground border-b border-border">
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
                  return isSameDay(eventStart, day);
                });

                return (
                  <div key={d} className={cn("relative min-h-[100px] p-1 border border-border", !isCurrentMonth && "bg-muted/30", isTodayDay && "bg-primary/5 ring ring-primary", dayEvents.length > 0 && "bg-accent/30")}>
                    <div className={cn("text-xs font-medium", isTodayDay && "text-primary")}>
                      {format(day, "d")}
                    </div>
                    <div className="mt-1 space-y-1 max-h-[80px] overflow-y-auto">
                      {dayEvents.slice(0, 3).map((e) => (
                        <div key={e.id} className="text-xs px-1.5 py-0.5 rounded truncate cursor-pointer hover:opacity-80" style={getEventStyle(e)} onClick={(ev) => { ev.stopPropagation(); setSelectedEvent(e); }}>
                          {e.allDay ? "All day" : formatTime(e.startAt)} {e.title}
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
            <p className="text-sm mt-1">Click &apos;Create&apos; to add your first event</p>
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
                  .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
                  .map((e) => (
                    <div
                      key={e.id}
                      className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-accent/50 cursor-pointer"
                      style={{ borderLeft: `3px solid ${displayCategories.find((c) => c.id === e.categoryId)?.color || "#4285F4"}` }}
                      onClick={() => setSelectedEvent(e)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{e.title}</span>
                          {e.allDay && <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">All day</span>}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                          {!e.allDay && (
                            <>
                              <Clock className="h-3.5 w-3.5" />
                              <span>{formatTime(e.startAt)} - {formatTime(e.endAt)}</span>
                            </>
                          )}
                          {e.location && (
                            <>
                              <MapPin className="h-3.5 w-3.5" />
                              <span className="truncate max-w-[200px]">{e.location}</span>
                            </>
                          )}
                          {e.videoCallLink && (
                            <>
                              <Video className="h-3.5 w-3.5" />
                              <span>Video call</span>
                            </>
                          )}
                        </div>
                        {e.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{e.description}</p>}
                      </div>
                      <div className="w-2 rounded-full" style={{ backgroundColor: displayCategories.find((c) => c.id === e.categoryId)?.color || "#4285F4" }} />
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
          <span className="font-medium">{format(currentDate, "MMMM yyyy")}</span>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" onClick={() => setCurrentDate(subMonths(currentDate, 1))} aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setCurrentDate(addMonths(currentDate, 1))} aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-center">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => (
            <div key={i} className="text-xs font-medium text-muted-foreground py-1">{d}</div>
          ))}
          {weeks.map((week, w) => (
            <React.Fragment key={w}>
              {week.map((day, d) => {
                const isCurrentMonth = isSameMonth(day, currentDate);
                const isTodayDay = isToday(day);
                const hasEvents = visibleEvents.some((e) => isSameDay(new Date(e.startAt), day));

                return (
                  <button key={d} onClick={() => setCurrentDate(day)} className={cn("aspect-square rounded-lg text-sm font-medium transition-colors", !isCurrentMonth && "text-muted-foreground/50", isTodayDay && "bg-primary text-primary-foreground", hasEvents && "relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1.5 after:h-1.5 after:rounded-full after:bg-current", "hover:bg-accent")}>
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
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLeftPanelOpen(!leftPanelOpen)} aria-label="Toggle calendar panel">
            <Calendar className="h-5 w-5" />
          </Button>
          <div className="hidden sm:flex items-center gap-2">
            <span className="text-lg font-semibold">Famora</span>
            <Separator className="h-6" orientation="vertical" />
            <span className="text-lg font-medium text-muted-foreground">Agenda</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-1 justify-center">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={goToToday} className="gap-1">
              <Home className="h-3.5 w-3.5" />
              <span>Today</span>
            </Button>
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Previous period">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-lg font-semibold w-56 text-center sm:w-auto">{getCurrentDateDisplay()}</span>
            <Button variant="ghost" size="icon" onClick={() => navigate(1)} aria-label="Next period">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1">
                <Calendar className="h-4 w-4" />
                <span className="hidden sm:inline">{view.charAt(0).toUpperCase() + view.slice(1)}</span>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-40" align="end">
              {(["day", "week", "month", "year", "agenda"] as ViewMode[]).map((v) => (
                <DropdownMenuItem key={v} onSelect={() => setView(v)} className={view === v ? "bg-accent" : ""}>
                  {v === "day" && <Sun className="mr-2 h-4 w-4" />}
                  {v === "week" && <LayoutGrid className="mr-2 h-4 w-4" />}
                  {v === "month" && <CalendarDays className="mr-2 h-4 w-4" />}
                  {v === "year" && <Calendar className="mr-2 h-4 w-4" />}
                  {v === "agenda" && <List className="mr-2 h-4 w-4" />}
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button className="ml-2 gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Create</span>
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <aside className={cn("hidden lg:flex flex-col border-r border-border bg-sidebar flex-shrink-0 transition-all duration-200", leftPanelOpen ? `w-[${SIDEBAR_WIDTH}px]` : `w-[${SIDEBAR_COLLAPSED_WIDTH}px]`)} style={{ width: leftPanelOpen ? `${SIDEBAR_WIDTH}px` : `${SIDEBAR_COLLAPSED_WIDTH}px` }}>
          <div className="flex-1 flex flex-col overflow-y-auto p-3 space-y-4">
            {leftPanelOpen && renderMiniCalendar()}

            {leftPanelOpen && (
              <div className="space-y-2 pt-2 border-t border-border">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-2">
                  Family Calendars
                </h3>
                <div className="space-y-1">
                  {displayCategories.map((cat) => (
                    <label key={cat.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent cursor-pointer transition-colors">
                      <input type="checkbox" checked={visibleCalendars.has(cat.id)} onChange={() => toggleCalendarVisibility(cat.id)} className="h-4 w-4 text-primary border-border rounded" />
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                      {!leftPanelOpen ? null : <span className="truncate text-sm">{cat.name}</span>}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Create Event button removed from left panel - use toolbar Create button instead */}
          </div>

          {!leftPanelOpen && (
            <div className="flex items-center justify-center h-16 border-t border-border">
              <Button variant="ghost" size="icon" onClick={() => setLeftPanelOpen(true)} aria-label="Expand calendar panel">
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
          )}
        </aside>

        <div className="flex-1 flex flex-col min-w-0">
          <main className="flex-1 flex flex-col min-w-0 w-full">
            <div className="flex-1 w-full min-w-0">
              {renderCurrentView()}
            </div>
          </main>
        </div>

        <aside className="hidden lg:block w-80 border-l border-border bg-card flex-shrink-0">
          {selectedEvent && (
            <div className="flex-1 flex flex-col overflow-y-auto p-4 space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold truncate">{selectedEvent.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {selectedEvent.allDay ? "All day" : `${formatTime(selectedEvent.startAt)} - ${formatTime(selectedEvent.endAt)}`}
                  </p>
                </div>
                <button onClick={() => setSelectedEvent(null)} className="text-muted-foreground hover:text-foreground">
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
                    <a href={selectedEvent.videoCallLink} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Join video call</a>
                  </div>
                )}
                {selectedEvent.description && (
                  <div className="pt-2 border-t border-border">
                    <p className="text-sm text-muted-foreground">{selectedEvent.description}</p>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: displayCategories.find((c) => c.id === selectedEvent.categoryId)?.color || "#4285F4" }} />
                  <span className="text-sm text-muted-foreground">{displayCategories.find((c) => c.id === selectedEvent.categoryId)?.name}</span>
                </div>
              </div>
              <div className="flex gap-2 pt-2 border-t border-border">
                <Button variant="outline" className="flex-1" onClick={() => setSelectedEvent(null)}>Close</Button>
                <Button variant="default" onClick={() => { /* Edit */ }}>Edit</Button>
              </div>
            </div>
          )}
        </aside>
      </div>

      {showCreatePopover && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowCreatePopover(false)} />
          <div className="fixed bottom-0 left-0 right-0 bg-background rounded-t-2xl shadow-xl p-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">New Event</h3>
              <button onClick={() => setShowCreatePopover(false)} className="text-muted-foreground">
                <MoreHorizontal className="h-6 w-6" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input placeholder="Event title" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Start</Label>
                  <Input type="datetime-local" />
                </div>
                <div className="space-y-2">
                  <Label>End</Label>
                  <Input type="datetime-local" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Input type="checkbox" id="allDay" />
                <Label htmlFor="allDay">All day</Label>
              </div>
              <Button className="w-full">Create Event</Button>
              <Button variant="ghost" className="w-full" onClick={() => setShowCreatePopover(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

