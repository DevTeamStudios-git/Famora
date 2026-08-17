import { FeaturePlaceholder } from "@/components/core/feature-placeholder";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Moderation" };

export default function Page() {
  return <FeaturePlaceholder title="Moderation" description="Review reported messages and moderation events." note="Administrative controls are being wired here with server-side permission checks." />;
}
