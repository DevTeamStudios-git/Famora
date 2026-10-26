"use client";
import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
export function Refresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    const refresh = () => {
      if (
        pending ||
        document.visibilityState !== "visible" ||
        document.querySelector('[role="dialog"]')
      )
        return;
      const focused = document.activeElement;
      if (
        focused instanceof HTMLInputElement ||
        focused instanceof HTMLTextAreaElement ||
        focused instanceof HTMLSelectElement ||
        (focused instanceof HTMLElement && focused.isContentEditable)
      )
        return;
      startTransition(() => router.refresh());
    };
    const interval = window.setInterval(refresh, 60000);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router, pending]);
  return null;
}
