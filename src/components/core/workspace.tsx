"use client";
import { useId, useOptimistic, useState, useTransition } from "react";
import Image from "next/image";
import { toast } from "sonner";
import {
  Plus,
  Search,
  ListChecks,
  BookOpen,
  ContactRound,
  ChefHat,
  Megaphone,
  Folder,
  Images,
  Vote,
  LayoutGrid,
  List,
} from "lucide-react";
import {
  modules,
  type ModuleKey,
  type WorkspaceItem,
  type Field,
} from "@/lib/workspace";
import {
  saveWorkspaceItem,
  deleteWorkspaceItem,
  voteInPoll,
} from "@/server/actions/workspace";
import { Refresh } from "@/components/core/refresh";
import { NotebookHistory } from "@/components/core/notebook-history";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  applyWorkspaceChange,
  previewWorkspaceItem,
} from "@/lib/workspace-optimistic";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";
export function FormField({
  field,
  value,
  members = [],
}: {
  field: Field;
  value?: string | boolean;
  members?: { id: string; name: string }[];
}) {
  const id = `${useId()}-${field.name}`;
  let defaultValue = typeof value === "string" ? value : undefined;
  if (field.type === "datetime-local" && defaultValue) {
    const date = new Date(defaultValue);
    if (!Number.isNaN(date.getTime()))
      defaultValue = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
  }
  if (field.type === "checkbox")
    return (
      <label className="flex items-center gap-2 text-sm" htmlFor={id}>
        <input
          id={id}
          name={field.name}
          type="checkbox"
          defaultChecked={value === true}
        />
        {field.label}
      </label>
    );
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {field.label}
      </label>
      {field.name === "assigneeId" ? (
        <select
          id={id}
          name={field.name}
          defaultValue={defaultValue}
          className={selectClass}
        >
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      ) : field.options ? (
        <select
          id={id}
          name={field.name}
          defaultValue={defaultValue}
          className={selectClass}
        >
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      ) : field.type === "textarea" ? (
        <Textarea
          id={id}
          name={field.name}
          defaultValue={defaultValue}
          required={field.required}
          rows={7}
          maxLength={50000}
        />
      ) : (
        <Input
          id={id}
          name={field.name}
          type={field.type ?? "text"}
          defaultValue={field.type === "file" ? undefined : defaultValue}
          required={field.required}
          min={
            field.type === "number"
              ? field.name === "servings"
                ? 1
                : 0
              : undefined
          }
          maxLength={field.type ? undefined : 300}
        />
      )}
    </div>
  );
}

export function Workspace({
  kind,
  items,
  members,
  canCreate,
  canEdit,
  canDelete,
}: {
  kind: ModuleKey;
  items: WorkspaceItem[];
  members: { id: string; name: string }[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const config = modules[kind];
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<WorkspaceItem | "new" | null>(null);
  const [editorError, setEditorError] = useState("");
  const [deleting, setDeleting] = useState<WorkspaceItem | null>(null);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState("all");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [optimisticItems, changeItems] = useOptimistic(
    items,
    applyWorkspaceChange,
  );
  const Icon = {
    tasks: ListChecks,
    notebook: BookOpen,
    personal: BookOpen,
    contacts: ContactRound,
    recipes: ChefHat,
    announcements: Megaphone,
    files: Folder,
    memories: Images,
    polls: Vote,
  }[kind];
  const visible = optimisticItems.filter(
    (i) =>
      `${i.title} ${i.body} ${i.detail ?? ""}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (status === "all" || i.values.status === status),
  );
  const draft = editor && editor !== "new" ? editor : null;
  const editing = draft && draft.id !== "new" ? draft : null;
  return (
    <div className="space-y-5">
      <Refresh />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="workspace-heading">
          <span className="workspace-symbol">
            <Icon className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">
              {config.title}
            </h1>
            <p className="text-sm text-muted-foreground">
              {kind === "personal"
                ? "Notes visible only to you."
                : `${optimisticItems.length} ${optimisticItems.length === 1 ? "item" : "items"} in your family workspace.`}
            </p>
          </div>
        </div>
        {canCreate && (
          <Button
            onClick={() => {
              setEditorError("");
              setEditor("new");
            }}
          >
            <Plus className="h-4 w-4" />
            {kind === "files" || kind === "memories" ? "Upload" : "Add new"}
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-muted/60 p-3">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            aria-label={`Search ${config.title}`}
            placeholder={`Search ${config.title.toLowerCase()}…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {kind === "tasks" && (
          <select
            aria-label="Filter task status"
            className={`${selectClass} max-w-44`}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">All tasks</option>
            {["TODO", "IN_PROGRESS", "COMPLETED"].map((s) => (
              <option key={s} value={s}>
                {s.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        )}
        <div className="ml-auto flex gap-1">
          <Button
            size="icon"
            variant={layout === "grid" ? "secondary" : "ghost"}
            aria-label="Grid view"
            aria-pressed={layout === "grid"}
            onClick={() => setLayout("grid")}
          >
            <LayoutGrid />
          </Button>
          <Button
            size="icon"
            variant={layout === "list" ? "secondary" : "ghost"}
            aria-label="List view"
            aria-pressed={layout === "list"}
            onClick={() => setLayout("list")}
          >
            <List />
          </Button>
        </div>
      </div>
      {!visible.length && (
        <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
          {query || status !== "all"
            ? "No matching items."
            : "Nothing here yet. Add the first item to get started."}
        </div>
      )}
      <div
        className={`workspace-grid grid gap-4 ${layout === "grid" ? "md:grid-cols-2 xl:grid-cols-3" : "grid-cols-1"}`}
      >
        {visible.map((item) => (
          <article
            key={item.id}
            aria-busy={item.values.__pending === true}
            className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-5 shadow-sm"
          >
            {item.url && item.mediaType?.startsWith("image/") && (
              <Image
                width={480}
                height={192}
                unoptimized
                src={item.url}
                alt={item.title}
                className="h-48 w-full rounded-lg object-cover"
              />
            )}
            {item.url && item.mediaType?.startsWith("video/") && (
              <video
                src={item.url}
                controls
                preload="metadata"
                className="w-full rounded-lg"
              />
            )}
            <div>
              <h2 className="break-words font-semibold">{item.title}</h2>
              {item.detail && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.detail}
                </p>
              )}
            </div>
            <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
              {item.body}
            </p>
            {item.url && kind === "files" && (
              <a href={item.url} className="text-sm text-primary underline">
                Download file
              </a>
            )}
            {item.options && (
              <div className="space-y-2">
                {item.options.map((option) => (
                  <Button
                    key={option.id}
                    variant={option.mine ? "default" : "outline"}
                    className="h-auto w-full justify-between whitespace-normal py-2"
                    disabled={
                      pending ||
                      item.values.__pending === true ||
                      item.body === "Voting closed"
                    }
                    onClick={() =>
                      startTransition(async () => {
                        changeItems({
                          type: "vote",
                          id: item.id,
                          optionId: option.id,
                        });
                        try {
                          const result = await voteInPoll(item.id, option.id);
                          if (result.error) toast.error(result.error);
                        } catch {
                          toast.error(
                            "Could not save your vote. Please try again.",
                          );
                        }
                      })
                    }
                  >
                    <span>
                      {option.label}
                      {option.mine ? " ✓" : ""}
                    </span>
                    <span className="ml-3">{option.votes}</span>
                  </Button>
                ))}
              </div>
            )}
            <div className="mt-auto flex gap-2 pt-2">
              {(kind === "notebook" || kind === "personal") && (
                <NotebookHistory
                  pageId={item.id}
                  personal={kind === "personal"}
                  canEdit={canEdit}
                />
              )}
              {canEdit && item.canEdit !== false && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditorError("");
                    setEditor(item);
                  }}
                >
                  Edit
                </Button>
              )}
              {canDelete && item.canDelete !== false && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleting(item)}
                >
                  {kind === "polls" ? "Close poll" : "Delete"}
                </Button>
              )}
            </div>
          </article>
        ))}
      </div>
      <Dialog
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit" : "New"} {config.title.toLowerCase()}
            </DialogTitle>
          </DialogHeader>
          {editorError && (
            <p role="alert" className="text-sm text-destructive">
              {editorError}
            </p>
          )}
          {editor && (
            <form
              key={editing?.id ?? "new"}
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const preview = previewWorkspaceItem(kind, form, editing);
                for (const field of config.fields) {
                  if (field.type !== "datetime-local" || !form.get(field.name))
                    continue;
                  const date = new Date(String(form.get(field.name)));
                  if (Number.isFinite(date.getTime()))
                    form.set(field.name, date.toISOString());
                }
                setEditor(null);
                startTransition(async () => {
                  changeItems({ type: "save", item: preview });
                  try {
                    const result = await saveWorkspaceItem(
                      kind,
                      editing?.id ?? null,
                      form,
                    );
                    if (result.error) {
                      toast.error(result.error);
                      setEditorError(result.error);
                      setEditor({
                        ...preview,
                        id: editing?.id ?? "new",
                        values: { ...preview.values, __pending: false },
                      });
                    }
                  } catch {
                    toast.error("Could not save this item. Please try again.");
                    setEditorError(
                      "Could not save this item. Please try again.",
                    );
                    setEditor({
                      ...preview,
                      id: editing?.id ?? "new",
                      values: { ...preview.values, __pending: false },
                    });
                  }
                });
              }}
            >
              {config.fields
                .filter(
                  (f) =>
                    !(
                      editing &&
                      (f.name === "file" ||
                        f.name === "folder" ||
                        f.name === "album")
                    ) && !(f.name === "assigneeId" && members.length === 0),
                )
                .map((f) => (
                  <FormField
                    key={f.name}
                    field={f}
                    value={draft?.values[f.name]}
                    members={members}
                  />
                ))}
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {kind === "polls" ? "Close voting?" : "Delete this item?"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm">{deleting?.title}</p>
          {deleting && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const item = deleting;
                setDeleting(null);
                startTransition(async () => {
                  changeItems({
                    type: kind === "polls" ? "close" : "delete",
                    id: item.id,
                  });
                  try {
                    const result = await deleteWorkspaceItem(kind, item.id);
                    if (result.error) toast.error(result.error);
                  } catch {
                    toast.error(
                      "Could not delete this item. Please try again.",
                    );
                  }
                });
              }}
            >
              <Button type="submit" disabled={pending}>
                {kind === "polls" ? "Close poll" : "Confirm delete"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
