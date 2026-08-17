import { FeaturePlaceholder } from "@/components/core/feature-placeholder";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Notifications" };

export default function Page() {
  return <FeaturePlaceholder title="Notifications" description="Family-wide notification configuration." note="Administrative controls are being wired here with server-side permission checks." />;
}
