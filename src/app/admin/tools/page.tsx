import { FeaturePlaceholder } from "@/components/core/feature-placeholder";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Tools Management" };

export default function Page() {
  return <FeaturePlaceholder title="Tools Management" description="Enable, disable and configure family tools." note="Administrative controls are being wired here with server-side permission checks." />;
}
