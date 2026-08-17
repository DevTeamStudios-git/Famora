import { redirect } from "next/navigation";
import { getAccessState } from "@/lib/auth/session";
import { getFamilyWithFeatures } from "@/server/queries/family";
import { isSupabaseConfigured } from "@/lib/env";
import { DISPLAY_ROLE_LABELS, getDisplayRole } from "@/lib/authorization/roles";
import { AppShell } from "@/components/layout/app-shell";

export default async function FamilyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // First-run guard: without Supabase credentials we cannot resolve the
  // session, so we point the operator at the setup guide.
  if (!isSupabaseConfigured()) {
    redirect("/setup");
  }

  const access = await getAccessState();
  if (access.status === "unauthenticated") {
    redirect("/login");
  }
  if (access.status === "denied") {
    redirect("/access-denied");
  }

  const { user, membership } = access;
  const family = await getFamilyWithFeatures(membership.familyId);
  if (!family) {
    redirect("/access-denied");
  }

  const { internalRole } = membership;
  const isAdmin =
    internalRole === "FAMILY_CHIEF" ||
    internalRole === "HIDDEN_ADMIN" ||
    internalRole === "CO_FAMILY_CHIEF";

  return (
    <AppShell
      user={{
        name: user.user_metadata?.name ?? user.email ?? "Family member",
        email: user.email ?? "",
        avatarUrl:
          typeof user.user_metadata?.avatar_url === "string"
            ? user.user_metadata.avatar_url
            : null,
        displayRoleLabel:
          DISPLAY_ROLE_LABELS[getDisplayRole(membership.internalRole)],
      }}
      familyName={family.name}
      isAdmin={isAdmin}
      enabledFeatures={[...family.features]}
    >
      {children}
    </AppShell>
  );
}