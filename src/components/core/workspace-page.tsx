import { Workspace } from "@/components/core/workspace";
import { loadWorkspace } from "@/server/queries/workspace";
import type { ModuleKey } from "@/lib/workspace";
export async function WorkspacePage({ kind }: { kind: ModuleKey }) {
  let data: Awaited<ReturnType<typeof loadWorkspace>> | null = null;
  let unavailable: string | null = null;
  try {
    data = await loadWorkspace(kind);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "This tool is disabled for your family." ||
        error.message === "You do not have permission to do this.")
    )
      unavailable = error.message;
    else throw error;
  }
  if (unavailable || !data)
    return (
      <div className="space-y-3 rounded-xl border p-6">
        <h1 className="text-xl font-semibold">Tool unavailable</h1>
        <p className="text-sm text-muted-foreground">{unavailable}</p>
      </div>
    );
  return <Workspace kind={kind} {...data} />;
}
