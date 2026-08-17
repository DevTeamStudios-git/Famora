import { FeaturePlaceholder } from "@/components/core/feature-placeholder";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Audit Log" };

export default function Page() {
  return <FeaturePlaceholder title="Audit Log" description="Administrative activity history." note="Administrative controls are being wired here with server-side permission checks." />;
}
