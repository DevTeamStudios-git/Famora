import { FeaturePlaceholder } from "@/components/core/feature-placeholder";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Sessions & Devices" };

export default function Page() {
  return <FeaturePlaceholder title="Sessions & Devices" description="Devices signed in to your account." note="This settings section will provide the controls described in the Famora specification." />;
}
