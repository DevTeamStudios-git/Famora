import { FeaturePlaceholder } from "@/components/core/feature-placeholder";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Admin Overview" };

export default function Page() {
  return <FeaturePlaceholder title="Admin Overview" description="High-level family statistics and system status." note="Administrative controls are being wired here with server-side permission checks." />;
}
