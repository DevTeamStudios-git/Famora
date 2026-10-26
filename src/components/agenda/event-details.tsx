"use client";
import { useCallback, useEffect, useState } from "react";
import {
  fetchEventDetails,
  changeEventDetails,
} from "@/server/actions/event-details";
import { ActionForm } from "@/components/core/action-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";
type Details = Awaited<ReturnType<typeof fetchEventDetails>>;
export function EventDetails({
  eventId,
  canEdit,
}: {
  eventId: string;
  canEdit: boolean;
}) {
  const [details, setDetails] = useState<Details | null>(null);
  const [error, setError] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const result = await fetchEventDetails(eventId);
      setDetails(result);
      setError(false);
    } catch {
      setError(true);
    }
  }, [eventId]);
  useEffect(() => {
    let active = true;
    fetchEventDetails(eventId)
      .then((result) => {
        if (active) {
          setDetails(result);
          setError(false);
        }
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [eventId]);
  const action = (operation: string) => async (form: FormData) => {
    const result = await changeEventDetails(eventId, operation, form);
    if (result.success) await refresh();
    return result;
  };
  if (error)
    return (
      <p role="alert" className="text-sm text-destructive">
        Could not load event details.
      </p>
    );
  if (!details)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading details…
      </p>
    );
  return (
    <div className="space-y-5 border-t pt-4">
      <section className="space-y-3">
        <h3 className="font-medium">Checklist</h3>
        {details.checklist.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between gap-2 text-sm"
          >
            <span
              className={
                item.isDone ? "line-through text-muted-foreground" : ""
              }
            >
              {item.label}
            </span>
            {canEdit && (
              <ActionForm
                className=""
                action={action("toggle")}
                submit={item.isDone ? "Undo" : "Done"}
              >
                <input type="hidden" name="itemId" value={item.id} />
                <input
                  type="hidden"
                  name="isDone"
                  value={String(!item.isDone)}
                />
              </ActionForm>
            )}
          </div>
        ))}
        {canEdit && (
          <ActionForm action={action("checklist")} submit="Add checklist item">
            <Input
              name="label"
              aria-label="Checklist item"
              placeholder="What needs doing?"
              required
              maxLength={200}
            />
          </ActionForm>
        )}
      </section>
      <section className="space-y-3">
        <h3 className="font-medium">Attachments</h3>
        {details.attachments.map((a) => (
          <Link
            key={a.id}
            href="/files"
            className="block text-sm text-primary underline"
          >
            {a.name}
          </Link>
        ))}
        {canEdit && details.files.length > 0 && (
          <ActionForm action={action("attach")} submit="Attach file">
            <select
              name="fileId"
              aria-label="Family file"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
              {details.files.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </ActionForm>
        )}
      </section>
      <section className="space-y-3">
        <h3 className="font-medium">Comments</h3>
        {details.comments.map((c) => (
          <article key={c.id} className="space-y-1 rounded-lg bg-muted p-3">
            <p className="text-xs text-muted-foreground">
              {c.author} · {new Date(c.date).toLocaleString()}
            </p>
            <p className="whitespace-pre-wrap break-words text-sm">{c.body}</p>
          </article>
        ))}
        <ActionForm action={action("comment")} submit="Add comment">
          <Textarea
            name="body"
            aria-label="Comment"
            placeholder="Add a comment…"
            required
            maxLength={5000}
          />
        </ActionForm>
      </section>
    </div>
  );
}
