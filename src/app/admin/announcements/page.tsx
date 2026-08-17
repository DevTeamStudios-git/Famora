import { FeaturePlaceholder } from "@/components/core/feature-placeholder";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Announcements" };

export default function Page() {
  return <FeaturePlaceholder title="Announcements" description="Manage published, draft and scheduled announcements." note="Administrative controls are being wired here with server-side permission checks." />;
}
