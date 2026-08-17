import { FeaturePlaceholder } from "@/components/core/feature-placeholder";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Family Chat" };

export default function Page() {
  return <FeaturePlaceholder title="Family Chat" description="Realtime family messaging." />;
}
