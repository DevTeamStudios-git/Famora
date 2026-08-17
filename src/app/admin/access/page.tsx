import { FeaturePlaceholder } from "@/components/core/feature-placeholder";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Family Access" };

export default function Page() {
  return <FeaturePlaceholder title="Family Access" description="Manage the whitelist of approved Google accounts." note="Administrative controls are being wired here with server-side permission checks." />;
}
