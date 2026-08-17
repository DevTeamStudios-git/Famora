import { FeaturePlaceholder } from "@/components/core/feature-placeholder";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Personal Notebook" };

export default function Page() {
  return <FeaturePlaceholder title="Personal Notebook" description="Your private, personal notes." />;
}
