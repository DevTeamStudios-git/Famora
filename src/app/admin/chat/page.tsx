import { FeaturePlaceholder } from "@/components/core/feature-placeholder";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Chat Management" };

export default function Page() {
  return <FeaturePlaceholder title="Chat Management" description="Search, filter and moderate family chat messages." note="Administrative controls are being wired here with server-side permission checks." />;
}
