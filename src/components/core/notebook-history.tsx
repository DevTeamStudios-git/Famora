"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  fetchNoteHistory,
  restoreNoteVersion,
} from "@/server/actions/notebook";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ActionForm } from "@/components/core/action-form";
export function NotebookHistory({
  pageId,
  personal,
  canEdit,
}: {
  pageId: string;
  personal: boolean;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<Awaited<
    ReturnType<typeof fetchNoteHistory>
  > | null>(null);
  const [error, setError] = useState("");
  const router = useRouter();
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={async () => {
          setOpen(true);
          setVersions(null);
          setError("");
          try {
            setVersions(await fetchNoteHistory(pageId, personal));
          } catch {
            setError("Could not load history.");
          }
        }}
      >
        History
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Note history</DialogTitle>
          </DialogHeader>
          {error && <p role="alert">{error}</p>}
          {!error && versions === null && <p>Loading history…</p>}
          {versions?.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No earlier versions yet. Edits are saved in the history.
            </p>
          )}
          {versions?.map((version) => (
            <article
              key={version.id}
              className="space-y-3 rounded-lg border p-4"
            >
              <p className="text-xs text-muted-foreground">
                {new Date(version.createdAt).toLocaleString()}
              </p>
              <p className="whitespace-pre-wrap text-sm">{version.body}</p>
              {canEdit && (
                <ActionForm
                  action={async () => {
                    const result = await restoreNoteVersion(
                      pageId,
                      version.id,
                      personal,
                    );
                    if (result.success) {
                      setOpen(false);
                      router.refresh();
                    }
                    return result;
                  }}
                  submit="Restore this version"
                />
              )}
            </article>
          ))}
        </DialogContent>
      </Dialog>
    </>
  );
}
