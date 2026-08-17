import { FeaturePlaceholder } from "@/components/core/feature-placeholder";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Security" };

export default function Page() {
  return <FeaturePlaceholder title="Security" description="Authentication, sessions and security controls." note="Administrative controls are being wired here with server-side permission checks." />;
}
