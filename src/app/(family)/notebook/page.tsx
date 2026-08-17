import { FeaturePlaceholder } from "@/components/core/feature-placeholder";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Family Notebook" };

export default function Page() {
  return <FeaturePlaceholder title="Family Notebook" description="Collaborative family knowledge base." />;
}
