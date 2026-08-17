import { FeaturePlaceholder } from "@/components/core/feature-placeholder";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Files & Uploads" };

export default function Page() {
  return <FeaturePlaceholder title="Files & Uploads" description="Default sort, view and preview behaviors." note="This settings section will provide the controls described in the Famora specification." />;
}
