import { FeaturePlaceholder } from "@/components/core/feature-placeholder";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Notifications" };

export default function Page() {
  return <FeaturePlaceholder title="Notifications" description="Your notification center." />;
}
