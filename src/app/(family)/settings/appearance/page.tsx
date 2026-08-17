import { FeaturePlaceholder } from "@/components/core/feature-placeholder";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Appearance" };

export default function Page() {
  return <FeaturePlaceholder title="Appearance" description="Theme, density, sidebar and starting page." note="This settings section will provide the controls described in the Famora specification." />;
}
