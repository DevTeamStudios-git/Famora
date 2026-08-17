import {
  CalendarPlus,
  MessageSquarePlus,
  MessagesSquare,
  ListPlus,
  NotebookPen,
  Upload,
  Vote,
  Megaphone,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const quickActions = [
  { label: "Add Event", icon: CalendarPlus, href: "/agenda" },
  { label: "Send Message", icon: MessageSquarePlus, href: "/chat" },
  { label: "Start DM", icon: MessagesSquare, href: "/dms" },
  { label: "Create Task", icon: ListPlus, href: "/tasks" },
  { label: "Add Note", icon: NotebookPen, href: "/notebook" },
  { label: "Upload File", icon: Upload, href: "/files" },
  { label: "Create Poll", icon: Vote, href: "/chat" },
  { label: "Announcement", icon: Megaphone, href: "/announcements" },
];

export const metadata = { title: "Home" };

export default function HomePage() {
  const today = new Date();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
        <p className="text-sm text-muted-foreground">
          {today.toLocaleDateString(undefined, {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      {/* Quick actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Quick actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Button
                  key={action.label}
                  variant="outline"
                  className="flex h-16 flex-col items-center justify-center gap-1 text-xs"
                  asChild
                >
                  <a href={action.href}>
                    <Icon className="h-4 w-4" aria-hidden />
                    {action.label}
                  </a>
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Dashboard widgets — placeholders wired to the realtime layer later */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">Today</CardTitle>
            <Badge variant="muted">Realtime</Badge>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>No events scheduled today.</p>
            <p className="mt-1">Birthdays, anniversaries and reminders will appear here.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Family activity</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>No recent activity yet.</p>
            <p className="mt-1">
              New events, files, notes and announcements will show up live here.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Upcoming</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            Upcoming events, birthdays and family tasks will be listed here from
            the shared agenda.
          </p>
        </CardContent>
      </Card>

      <Separator />

      <p className="text-xs text-muted-foreground">
        Famora skeleton — dashboard modules stream realtime data from the shared
        family calendar, chat, tasks and notebooks.
      </p>
    </div>
  );
}