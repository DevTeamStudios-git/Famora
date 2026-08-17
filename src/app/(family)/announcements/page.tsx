import { FeaturePlaceholder } from "@/components/core/feature-placeholder";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Announcements" };

export default function Page() {
  return <FeaturePlaceholder title="Announcements" description="Important family-wide notices." />;
}
