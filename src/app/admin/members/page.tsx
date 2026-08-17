import { FeaturePlaceholder } from "@/components/core/feature-placeholder";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Member Management" };

export default function Page() {
  return <FeaturePlaceholder title="Member Management" description="Manage members, roles and access." note="Administrative controls are being wired here with server-side permission checks." />;
}
