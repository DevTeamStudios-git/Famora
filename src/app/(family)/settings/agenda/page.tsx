import { FeaturePlaceholder } from "@/components/core/feature-placeholder";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Agenda & Calendar" };

export default function Page() {
  return <FeaturePlaceholder title="Agenda & Calendar" description="Default view, time zone, reminders and working hours." note="This settings section will provide the controls described in the Famora specification." />;
}
