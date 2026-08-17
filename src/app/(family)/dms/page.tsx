import { FeaturePlaceholder } from "@/components/core/feature-placeholder";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "DMs" };

export default function Page() {
  return <FeaturePlaceholder title="DMs" description="Private one-to-one conversations." />;
}
