import { Construction } from "lucide-react";
import { EmptyState } from "@/components/core/empty-state";
import { PageHeader } from "@/components/core/page-header";

type FeaturePlaceholderProps = {
  title: string;
  description?: string;
  note?: string;
};

/**
 * Consistent scaffold placeholder for modules that are wired into routing and
 * navigation but not yet implemented. Replace with real feature pages.
 */
export function FeaturePlaceholder({
  title,
  description,
  note,
}: FeaturePlaceholderProps) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <div className="mt-6">
        <EmptyState
          icon={Construction}
          title={`${title} is coming soon`}
          description={
            note ??
            `The ${title} module is scaffolded. Implementation will land here as the Famora feature set is built out.`
          }
        />
      </div>
    </>
  );
}