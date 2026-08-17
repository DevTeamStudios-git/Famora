import { FeaturePlaceholder } from "@/components/core/feature-placeholder";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Recipes" };

export default function Page() {
  return <FeaturePlaceholder title="Recipes" description="Family recipe box." />;
}
