import { FeaturePlaceholder } from "@/components/core/feature-placeholder";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Roles & Permissions" };

export default function Page() {
  return <FeaturePlaceholder title="Roles & Permissions" description="Permission matrix and role configuration." note="Administrative controls are being wired here with server-side permission checks." />;
}
