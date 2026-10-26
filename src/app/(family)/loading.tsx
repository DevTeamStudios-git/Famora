export default function Loading() {
  return (
    <div className="space-y-7 p-1" role="status" aria-label="Loading workspace">
      <div className="h-8 w-56 animate-pulse rounded-full bg-muted" />
      <div className="h-12 max-w-xl animate-pulse rounded-full bg-muted" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="h-44 animate-pulse rounded-3xl bg-muted/70"
          />
        ))}
      </div>
      <span className="sr-only">Loading your workspace…</span>
    </div>
  );
}
