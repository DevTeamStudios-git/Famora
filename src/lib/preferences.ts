import type { Field } from "@/lib/workspace";
export const preferenceSections: Record<
  string,
  { title: string; fields: Field[]; defaults: Record<string, string | boolean> }
> = {
  appearance: {
    title: "Appearance",
    fields: [
      { name: "theme", label: "Theme", options: ["system", "light", "dark"] },
      {
        name: "density",
        label: "Density",
        options: ["comfortable", "compact"],
      },
    ],
    defaults: { theme: "system", density: "comfortable" },
  },
  accessibility: {
    title: "Accessibility",
    fields: [
      { name: "reducedMotion", label: "Reduce motion", type: "checkbox" },
      { name: "largerText", label: "Larger text", type: "checkbox" },
      { name: "highContrast", label: "Higher contrast", type: "checkbox" },
    ],
    defaults: {},
  },
  privacy: {
    title: "Privacy",
    fields: [
      {
        name: "showPresence",
        label: "Share typing activity in family chat",
        type: "checkbox",
      },
      {
        name: "readReceipts",
        label: "Send read receipts in direct messages",
        type: "checkbox",
      },
    ],
    defaults: { showPresence: true, readReceipts: true },
  },
  notifications: {
    title: "Notifications",
    fields: ["tasks", "announcements", "dms"].map((name) => ({
      name,
      label: `Notify me about ${name}`,
      type: "checkbox",
    })),
    defaults: { tasks: true, announcements: true, dms: true },
  },
  agenda: {
    title: "Agenda & Calendar",
    fields: [
      {
        name: "defaultView",
        label: "Default calendar view",
        options: ["day", "week", "month", "year", "agenda"],
      },
    ],
    defaults: { defaultView: "month" },
  },
  chat: {
    title: "Chat & Messaging",
    fields: [
      { name: "enterToSend", label: "Enter sends a message", type: "checkbox" },
    ],
    defaults: { enterToSend: true },
  },
  files: {
    title: "Files & Uploads",
    fields: [
      { name: "sort", label: "Default sort", options: ["newest", "name"] },
    ],
    defaults: { sort: "newest" },
  },
  "family-notebook": {
    title: "Family Notebook",
    fields: [
      { name: "sort", label: "Default sort", options: ["updated", "title"] },
    ],
    defaults: { sort: "updated" },
  },
  "personal-notebook": {
    title: "Personal Notebook",
    fields: [
      { name: "sort", label: "Default sort", options: ["updated", "title"] },
    ],
    defaults: { sort: "updated" },
  },
  "family-preferences": {
    title: "Family Preferences",
    fields: [
      {
        name: "landingPage",
        label: "Starting page",
        options: ["home", "agenda", "chat", "tasks"],
      },
    ],
    defaults: { landingPage: "home" },
  },
  language: {
    title: "Language & Region",
    fields: [
      {
        name: "dateFormat",
        label: "Date format",
        options: ["locale", "yyyy-MM-dd", "dd/MM/yyyy", "MM/dd/yyyy"],
      },
    ],
    defaults: { dateFormat: "locale" },
  },
};

export function formatPreferredDate(
  date: Date,
  dateFormat: unknown = "locale",
) {
  if (dateFormat === "locale") return date.toLocaleDateString();
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (name: string) =>
    parts.find((p) => p.type === name)?.value ?? "";
  const year = part("year"),
    month = part("month"),
    day = part("day");
  if (dateFormat === "yyyy-MM-dd") return `${year}-${month}-${day}`;
  if (dateFormat === "MM/dd/yyyy") return `${month}/${day}/${year}`;
  return `${day}/${month}/${year}`;
}
