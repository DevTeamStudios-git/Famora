import { FeaturePlaceholder } from "@/components/core/feature-placeholder";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Agenda Management" };

export default function Page() {
  return <FeaturePlaceholder title="Agenda Management" description="Administrate the family calendar." note="Administrative controls are being wired here with server-side permission checks." />;
}
