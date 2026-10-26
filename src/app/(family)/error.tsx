"use client";
import { Button } from "@/components/ui/button";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg space-y-4 rounded-xl border bg-card p-8">
      <h1 className="text-xl font-semibold">Could not load this page</h1>
      <p className="text-sm text-muted-foreground">
        The service may be unavailable, or this tool may be disabled for your
        account. Try again or return to the family home.
      </p>
      <div className="flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/">Home</Link>
        </Button>
      </div>
    </div>
  );
}
