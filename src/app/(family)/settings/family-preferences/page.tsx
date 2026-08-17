import { FeaturePlaceholder } from "@/components/core/feature-placeholder";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Family Preferences" };

export default function Page() {
  return <FeaturePlaceholder title="Family Preferences" description="Sidebar ordering, pinned tools and dashboard cards for this family." note="This settings section will provide the controls described in the Famora specification." />;
}
