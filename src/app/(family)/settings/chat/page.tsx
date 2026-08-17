import { FeaturePlaceholder } from "@/components/core/feature-placeholder";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Chat & Messaging" };

export default function Page() {
  return <FeaturePlaceholder title="Chat & Messaging" description="Enter-to-send, previews, emoji and personal dictionary." note="This settings section will provide the controls described in the Famora specification." />;
}
