import { FeaturePlaceholder } from "@/components/core/feature-placeholder";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Accessibility" };

export default function Page() {
  return <FeaturePlaceholder title="Accessibility" description="Reduced motion, larger text, contrast and touch targets." note="This settings section will provide the controls described in the Famora specification." />;
}
