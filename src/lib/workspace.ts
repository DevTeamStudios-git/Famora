import type { PermissionKey } from "@/lib/authorization/permissions";

export type Field = {
  name: string;
  label: string;
  type?:
    | "textarea"
    | "datetime-local"
    | "date"
    | "email"
    | "url"
    | "number"
    | "checkbox"
    | "file";
  options?: readonly string[];
  required?: boolean;
};
type Module = {
  title: string;
  path: string;
  feature: string;
  read: PermissionKey;
  create: PermissionKey;
  update: PermissionKey;
  delete: PermissionKey;
  fields: Field[];
};
export const modules = {
  tasks: {
    title: "Tasks",
    path: "/tasks",
    feature: "tasks",
    read: "tasks.read",
    create: "tasks.create",
    update: "tasks.update",
    delete: "tasks.delete",
    fields: [
      { name: "title", label: "Title", required: true },
      { name: "description", label: "Description", type: "textarea" },
      { name: "dueAt", label: "Due date", type: "datetime-local" },
      {
        name: "priority",
        label: "Priority",
        options: ["MEDIUM", "LOW", "HIGH", "URGENT"],
      },
      {
        name: "status",
        label: "Status",
        options: ["TODO", "IN_PROGRESS", "COMPLETED"],
      },
      { name: "assigneeId", label: "Assign to" },
    ],
  },
  notebook: {
    title: "Family Notebook",
    path: "/notebook",
    feature: "notebook",
    read: "notebook.family_read",
    create: "notebook.family_create",
    update: "notebook.family_update",
    delete: "notebook.family_delete",
    fields: [
      { name: "title", label: "Title", required: true },
      { name: "body", label: "Note", type: "textarea", required: true },
    ],
  },
  personal: {
    title: "Personal Notebook",
    path: "/notebook/personal",
    feature: "notebook",
    read: "notebook.personal",
    create: "notebook.personal",
    update: "notebook.personal",
    delete: "notebook.personal",
    fields: [
      { name: "title", label: "Title", required: true },
      { name: "body", label: "Private note", type: "textarea", required: true },
    ],
  },
  contacts: {
    title: "Contacts",
    path: "/contacts",
    feature: "contacts",
    read: "contacts.read",
    create: "contacts.create",
    update: "contacts.manage",
    delete: "contacts.manage",
    fields: [
      { name: "name", label: "Name", required: true },
      { name: "category", label: "Category", required: true },
      { name: "phone", label: "Phone" },
      { name: "email", label: "Email", type: "email" },
      { name: "address", label: "Address" },
      { name: "website", label: "Website", type: "url" },
      { name: "notes", label: "Notes", type: "textarea" },
      { name: "isEmergency", label: "Emergency contact", type: "checkbox" },
    ],
  },
  recipes: {
    title: "Recipes",
    path: "/tools/recipes",
    feature: "recipes",
    read: "recipes.read",
    create: "recipes.create",
    update: "recipes.manage",
    delete: "recipes.manage",
    fields: [
      { name: "title", label: "Title", required: true },
      {
        name: "ingredients",
        label: "Ingredients (one per line)",
        type: "textarea",
        required: true,
      },
      { name: "body", label: "Instructions", type: "textarea", required: true },
      { name: "prepMinutes", label: "Preparation (minutes)", type: "number" },
      { name: "cookMinutes", label: "Cooking (minutes)", type: "number" },
      { name: "servings", label: "Servings", type: "number" },
    ],
  },
  announcements: {
    title: "Announcements",
    path: "/announcements",
    feature: "announcements",
    read: "announcements.read",
    create: "announcements.manage",
    update: "announcements.manage",
    delete: "announcements.manage",
    fields: [
      { name: "title", label: "Title", required: true },
      { name: "body", label: "Announcement", type: "textarea", required: true },
      {
        name: "priority",
        label: "Priority",
        options: ["NORMAL", "IMPORTANT", "URGENT"],
      },
      {
        name: "status",
        label: "Status",
        options: ["PUBLISHED", "DRAFT", "SCHEDULED", "ARCHIVED"],
      },
      { name: "scheduledFor", label: "Publish at", type: "datetime-local" },
      { name: "expiresAt", label: "Expires at", type: "datetime-local" },
    ],
  },
  files: {
    title: "Files",
    path: "/files",
    feature: "files",
    read: "files.read",
    create: "files.upload",
    update: "files.manage",
    delete: "files.delete",
    fields: [
      { name: "name", label: "Name", required: true },
      { name: "folder", label: "Folder" },
      {
        name: "file",
        label: "File (up to 10 MB)",
        type: "file",
        required: true,
      },
    ],
  },
  memories: {
    title: "Memories",
    path: "/memories",
    feature: "memories",
    read: "memories.read",
    create: "memories.create",
    update: "memories.manage",
    delete: "memories.manage",
    fields: [
      { name: "caption", label: "Caption", required: true },
      { name: "takenAt", label: "Taken on", type: "date" },
      { name: "album", label: "Album" },
      {
        name: "file",
        label: "Photo or video (up to 10 MB)",
        type: "file",
        required: true,
      },
    ],
  },
  polls: {
    title: "Polls",
    path: "/tools/polls",
    feature: "polls",
    read: "polls.read",
    create: "polls.create",
    update: "polls.create",
    delete: "polls.create",
    fields: [
      { name: "question", label: "Question", required: true },
      {
        name: "options",
        label: "Options (one per line)",
        type: "textarea",
        required: true,
      },
      { name: "deadline", label: "Deadline", type: "datetime-local" },
      {
        name: "isMultipleChoice",
        label: "Allow multiple choices",
        type: "checkbox",
      },
      { name: "isAnonymous", label: "Anonymous votes", type: "checkbox" },
    ],
  },
} satisfies Record<string, Module>;
export type ModuleKey = keyof typeof modules;
export type WorkspaceItem = {
  id: string;
  title: string;
  body: string;
  detail?: string;
  values: Record<string, string | boolean>;
  url?: string;
  mediaType?: string;
  options?: { id: string; label: string; votes: number; mine: boolean }[];
  canEdit?: boolean;
  canDelete?: boolean;
};

export function textDocument(body: string) {
  return {
    type: "doc",
    content: body.split("\n").map((text) => ({
      type: "paragraph",
      ...(text ? { content: [{ type: "text", text }] } : {}),
    })),
  };
}
export function documentText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const node = value as { text?: string; type?: string; content?: unknown[] };
  if (node.text) return node.text;
  return (node.content ?? [])
    .map(documentText)
    .join(node.type === "doc" ? "\n" : "");
}
