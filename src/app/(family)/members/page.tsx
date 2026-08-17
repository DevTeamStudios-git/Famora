import { FeaturePlaceholder } from "@/components/core/feature-placeholder";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Family Members" };

export default function Page() {
  return <FeaturePlaceholder title="Family Members" description="Members, roles and presence." />;
}
