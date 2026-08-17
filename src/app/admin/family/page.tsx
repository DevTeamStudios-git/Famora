import { FeaturePlaceholder } from "@/components/core/feature-placeholder";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Family Settings" };

export default function Page() {
  return <FeaturePlaceholder title="Family Settings" description="General family information and defaults." note="Administrative controls are being wired here with server-side permission checks." />;
}
