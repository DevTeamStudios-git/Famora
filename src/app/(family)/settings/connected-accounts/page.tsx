import { FeaturePlaceholder } from "@/components/core/feature-placeholder";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Connected Accounts" };

export default function Page() {
  return <FeaturePlaceholder title="Connected Accounts" description="Your connected Google identity." note="This settings section will provide the controls described in the Famora specification." />;
}
