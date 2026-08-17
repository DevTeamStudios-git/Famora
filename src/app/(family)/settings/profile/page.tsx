import { FeaturePlaceholder } from "@/components/core/feature-placeholder";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "My Profile" };

export default function Page() {
  return <FeaturePlaceholder title="My Profile" description="Manage your name, avatar, bio, birthday and contact details." note="This settings section will provide the controls described in the Famora specification." />;
}
