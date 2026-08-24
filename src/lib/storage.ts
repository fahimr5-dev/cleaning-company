import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Photos and documents live in Supabase Storage, not in the database.
 *
 * PLAIN ENGLISH: the buckets are private, so a photo of somebody's kitchen
 * cannot be seen by guessing its address. Every view goes through a signed
 * link that expires.
 *
 * If storage is not configured this does NOT pretend to work: uploads fail with
 * a readable message and the server prints a loud TODO.
 */

export const JOB_PHOTO_BUCKET = "job-photos";

function serviceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env.supabaseUrl || !key) return null;
  return createClient(env.supabaseUrl, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function isStorageConfigured(): boolean {
  return Boolean(env.supabaseUrl && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

let warned = false;
function warnOnce() {
  if (warned) return;
  warned = true;
  console.warn(
    "\n!! TODO — PHOTO STORAGE IS NOT CONFIGURED.\n" +
      "   NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed for\n" +
      "   before/after photos. Cleaners can still do everything else; photo\n" +
      "   upload will refuse with a message rather than silently losing files.\n" +
      "   See .env.example, Section 1.\n",
  );
}

export type UploadResult =
  | { ok: true; storagePath: string }
  | { ok: false; error: string };

/**
 * Stores one job photo.
 *
 * The folder is the job id, which is what the storage rules in
 * `prisma/sql/02_storage.sql` use to decide who may read it.
 */
export async function uploadJobPhoto(input: {
  jobId: string;
  fileName: string;
  contentType: string;
  body: ArrayBuffer;
}): Promise<UploadResult> {
  const client = serviceClient();
  if (!client) {
    warnOnce();
    return {
      ok: false,
      error: "Photo storage is not set up yet. Ask your administrator to add the Supabase keys.",
    };
  }

  // Never trust a filename from a phone as a storage path.
  const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  const storagePath = `${input.jobId}/${Date.now()}-${safeName}`;

  const { error } = await client.storage
    .from(JOB_PHOTO_BUCKET)
    .upload(storagePath, input.body, { contentType: input.contentType, upsert: false });

  if (error) {
    console.error("[storage] Upload failed:", error.message);
    return { ok: false, error: `The photo could not be saved: ${error.message}` };
  }

  return { ok: true, storagePath };
}

/** A link that works for an hour, then stops. Null when storage is off. */
export async function createSignedPhotoUrl(
  storagePath: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  const client = serviceClient();
  if (!client) return null;

  const { data, error } = await client.storage
    .from(JOB_PHOTO_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error) {
    console.error("[storage] Could not sign a link:", error.message);
    return null;
  }
  return data?.signedUrl ?? null;
}

export async function deleteJobPhoto(storagePath: string): Promise<boolean> {
  const client = serviceClient();
  if (!client) return false;
  const { error } = await client.storage.from(JOB_PHOTO_BUCKET).remove([storagePath]);
  if (error) console.error("[storage] Could not delete a photo:", error.message);
  return !error;
}
