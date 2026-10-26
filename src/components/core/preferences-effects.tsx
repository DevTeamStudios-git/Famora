"use client";
import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
export function PreferencesEffects({
  theme,
  density,
  accessibility,
}: {
  theme: string;
  density: string;
  accessibility: Record<string, unknown>;
}) {
  const { setTheme } = useTheme();
  const appliedTheme = useRef<string | null>(null);
  const router = useRouter();
  useEffect(() => {
    const openSearch = () => router.push("/search");
    const openCreate = () => router.push("/tools");
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openSearch();
      }
    };
    document.addEventListener("famora:open-search", openSearch);
    document.addEventListener("famora:open-create", openCreate);
    document.addEventListener("keydown", shortcut);
    return () => {
      document.removeEventListener("famora:open-search", openSearch);
      document.removeEventListener("famora:open-create", openCreate);
      document.removeEventListener("keydown", shortcut);
    };
  }, [router]);
  useEffect(() => {
    // next-themes changes setTheme's identity after a toggle. Only a newly
    // received account preference should replace the user's current choice.
    if (appliedTheme.current === theme) return;
    appliedTheme.current = theme;
    setTheme(theme);
  }, [theme, setTheme]);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.density = density;
    root.dataset.reducedMotion = String(accessibility.reducedMotion === true);
    root.dataset.largerText = String(accessibility.largerText === true);
    root.dataset.highContrast = String(accessibility.highContrast === true);
  }, [density, accessibility]);
  return null;
}
