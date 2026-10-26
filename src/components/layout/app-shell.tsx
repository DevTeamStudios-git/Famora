import { AppSidebar } from "@/components/layout/app-sidebar";
import { Topbar } from "@/components/layout/topbar";
import { MobileNav } from "@/components/layout/mobile-nav";
import type { ShellUser } from "@/components/layout/user-menu";
import { NavigationProgress } from "@/components/layout/navigation-progress";

type AppShellProps = {
  user: ShellUser;
  familyName: string;
  isAdmin: boolean;
  enabledFeatures: string[];
  children: React.ReactNode;
};

export function AppShell({
  user,
  familyName,
  isAdmin,
  enabledFeatures,
  children,
}: AppShellProps) {
  return (
    <div className="flex min-h-dvh w-full bg-background">
      <NavigationProgress />
      <AppSidebar
        user={user}
        familyName={familyName}
        isAdmin={isAdmin}
        enabledFeatures={enabledFeatures}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          user={user}
          familyName={familyName}
          isAdmin={isAdmin}
          enabledFeatures={enabledFeatures}
        />
        <main className="workspace-canvas mx-auto w-full flex-1 px-4 py-6 pb-24 sm:px-7 lg:px-9 lg:py-8 lg:pb-8">
          {children}
        </main>
      </div>
      <MobileNav enabledFeatures={enabledFeatures} />
    </div>
  );
}
