import { FeaturePlaceholder } from "@/components/core/feature-placeholder";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Search" };

export default function Page() {
  return <FeaturePlaceholder title="Search" description="Search across the whole family." />;
}
