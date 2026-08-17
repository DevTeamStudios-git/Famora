import { FeaturePlaceholder } from "@/components/core/feature-placeholder";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Agenda" };

export default function Page() {
  return <FeaturePlaceholder title="Agenda" description="Shared family calendar with day, week, month and list views." />;
}
