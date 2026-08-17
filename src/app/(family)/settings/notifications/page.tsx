import { FeaturePlaceholder } from "@/components/core/feature-placeholder";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Notifications" };

export default function Page() {
  return <FeaturePlaceholder title="Notifications" description="Choose which notifications you receive and how." note="This settings section will provide the controls described in the Famora specification." />;
}
