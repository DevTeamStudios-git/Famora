import { FeaturePlaceholder } from "@/components/core/feature-placeholder";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Files & Storage" };

export default function Page() {
  return <FeaturePlaceholder title="Files & Storage" description="Storage usage, files and upload limits." note="Administrative controls are being wired here with server-side permission checks." />;
}
