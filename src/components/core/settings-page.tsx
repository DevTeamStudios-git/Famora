import { requireAccess } from "@/server/workspace-access";
import { prisma } from "@/lib/prisma/client";
import { preferenceSections } from "@/lib/preferences";
import { ActionForm } from "@/components/core/action-form";
import { FormField } from "@/components/core/workspace";
import {
  savePreferences,
  saveProfile,
  signOutEverywhere,
} from "@/server/actions/account";
import type { Field } from "@/lib/workspace";

export async function SettingsPage({ section }: { section: string }) {
  const access = await requireAccess();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: access.user.id },
    include: { settings: true },
  });
  if (section === "profile") {
    const fields: Field[] = [
      { name: "displayName", label: "Display name", required: true },
      {
        name: "avatarUpload",
        label: "Avatar (JPEG, PNG or WebP, up to 3 MB)",
        type: "file",
      },
      { name: "preferredName", label: "Preferred name" },
      { name: "bio", label: "Bio", type: "textarea" },
      { name: "birthday", label: "Birthday", type: "date" },
      { name: "phone", label: "Phone" },
      { name: "timezone", label: "Time zone" },
      { name: "language", label: "Language code" },
    ];
    return (
      <div className="max-w-xl space-y-5">
        <h1 className="text-xl font-semibold">My Profile</h1>
        <ActionForm action={saveProfile}>
          {fields.map((field) => (
            <FormField
              key={field.name}
              field={field}
              value={
                field.name === "birthday"
                  ? user.birthday?.toISOString().slice(0, 10)
                  : String(user[field.name as keyof typeof user] ?? "")
              }
            />
          ))}
        </ActionForm>
      </div>
    );
  }
  if (section === "connected-accounts")
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Connected Accounts</h1>
        <p className="text-sm">Google · {access.user.email}</p>
        <p className="text-sm text-muted-foreground">
          Your approved Google identity is used to sign in to Famora.
        </p>
      </div>
    );
  if (section === "sessions")
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Sessions & Devices</h1>
        <p className="text-sm">
          Sign out of all devices. You will need to sign in again on this
          device.
        </p>
        <ActionForm action={signOutEverywhere} submit="Sign out everywhere" />
      </div>
    );
  const config = preferenceSections[section];
  if (!config) return null;
  const saved = user.settings?.appearanceJson as Record<
    string,
    Record<string, string | boolean>
  > | null;
  const values = { ...config.defaults, ...saved?.[section] };
  return (
    <div className="max-w-xl space-y-5">
      <h1 className="text-xl font-semibold">{config.title}</h1>
      <ActionForm action={savePreferences.bind(null, section)}>
        {config.fields.map((field) => (
          <FormField
            key={field.name}
            field={field}
            value={values[field.name]}
          />
        ))}
      </ActionForm>
    </div>
  );
}
