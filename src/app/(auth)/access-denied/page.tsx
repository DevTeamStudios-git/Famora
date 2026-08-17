"use client";

import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AccessDeniedPage() {
  const router = useRouter();

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <Card className="shadow-popover">
      <CardHeader className="items-center text-center">
        <CardTitle className="text-xl">You don&apos;t have access to this family</CardTitle>
        <CardDescription>
          This Famora family is private and only approved Google accounts can
          access it.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-center text-xs text-muted-foreground">
          If you believe this is a mistake, ask your Family Chief to add your
          Google account, then sign out and try again.
        </p>
        <Button variant="outline" className="w-full" onClick={signOut}>
          Sign out and use a different Google account
        </Button>
      </CardContent>
    </Card>
  );
}