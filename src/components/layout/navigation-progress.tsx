"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
export function NavigationProgress() {
  const pathname = usePathname();
  const [destination, setDestination] = useState<string | null>(null);
  useEffect(() => {
    const click = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0
      )
        return;
      const link =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.target === "_blank" ||
        link.download
      )
        return;
      const url = new URL(link.href);
      if (url.origin === location.origin && url.pathname !== pathname)
        setDestination(url.pathname);
    };
    // Capture before Next's Link handler prevents the browser's default navigation.
    document.addEventListener("click", click, true);
    return () => document.removeEventListener("click", click, true);
  }, [pathname]);
  useEffect(() => {
    const id = window.setTimeout(() => setDestination(null), 12000);
    return () => window.clearTimeout(id);
  }, [destination]);
  const pending = destination !== null && destination !== pathname;
  return pending ? (
    <div
      className="navigation-progress"
      role="status"
      aria-label="Opening page"
    >
      <span />
    </div>
  ) : null;
}
