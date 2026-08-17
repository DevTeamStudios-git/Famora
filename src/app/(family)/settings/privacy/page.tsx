import { FeaturePlaceholder } from "@/components/core/feature-placeholder";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Privacy" };

export default function Page() {
  return <FeaturePlaceholder title="Privacy" description="Control presence, last seen, read receipts and profile visibility." note="This settings section will provide the controls described in the Famora specification." />;
}
