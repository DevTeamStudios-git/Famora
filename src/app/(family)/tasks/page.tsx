import { FeaturePlaceholder } from "@/components/core/feature-placeholder";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Tasks" };

export default function Page() {
  return <FeaturePlaceholder title="Tasks" description="Shared family to-do list." />;
}
