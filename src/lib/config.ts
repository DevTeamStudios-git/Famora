// Famora deployment configuration.

/** Stable UUID for the initially seeded Famora family. */
export const FAMORA_SEED_FAMILY_ID = "00000000-0000-4000-8000-000000000001";

/** Default family name shown during first-run / seed. */
export const FAMORA_SEED_FAMILY_NAME = "Famora";

/** Supabase Storage bucket names. */
export const STORAGE_BUCKETS = {
  files: "families",
  personal: "personal",
  avatars: "avatars",
} as const;