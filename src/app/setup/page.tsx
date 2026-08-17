import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isSupabaseConfigured } from "@/lib/env";
import { redirect } from "next/navigation";

export const metadata = { title: "Setup required" };

export default function SetupPage() {
  if (isSupabaseConfigured()) {
    redirect("/login");
  }

  const steps = [
    "Create a Supabase project and enable Google OAuth.",
    "Copy the project URL and anon key into your .env (see .env.example).",
    "Run `pnpm prisma migrate dev` to create the schema.",
    "Run `pnpm prisma db seed` (or the Supabase seed) to load the initial family whitelist.",
    "Run `pnpm dev` and sign in with an approved Google account.",
  ];

  return (
    <div className="mx-auto w-full max-w-2xl pt-16">
      <Card className="shadow-popover">
        <CardHeader>
          <CardTitle>Famora is not configured yet</CardTitle>
          <CardDescription>
            Supabase credentials are missing. Add them to your environment and
            restart the dev server.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}