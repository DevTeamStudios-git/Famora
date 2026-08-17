import { FeaturePlaceholder } from "@/components/core/feature-placeholder";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Contacts" };

export default function Page() {
  return <FeaturePlaceholder title="Contacts" description="Shared family contacts." />;
}
