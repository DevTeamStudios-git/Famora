import { FeaturePlaceholder } from "@/components/core/feature-placeholder";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Memories" };

export default function Page() {
  return <FeaturePlaceholder title="Memories" description="Family photo and video archive." />;
}
