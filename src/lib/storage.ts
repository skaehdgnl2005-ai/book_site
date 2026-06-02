import { redact } from "./env";

/**
 * Durable object storage for access-controlled uploads (child photos), via the Supabase
 * Storage REST API. Server-only — uses the `service_role` secret key, which bypasses RLS
 * and must NEVER reach the client (no `NEXT_PUBLIC_` prefix; redacted from any error).
 *
 * Env-gated (parallels the DB seam): when the three SUPABASE_* vars are absent (the hermetic
 * `pnpm check` / Playwright path), `putObject` is a no-op and only the descriptor is recorded
 * — bytes are durably stored only where Storage is configured. `storageKey` (opaque, from
 * src/lib/assets) is the object path inside the private bucket; objects are never public.
 */

export type StorageConfig = { url: string; serviceKey: string; bucket: string };

/** Parse the Supabase Storage config from env; null unless all three are set. */
export function storageConfig(env: Record<string, string | undefined> = process.env): StorageConfig | null {
  const url = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = env.SUPABASE_STORAGE_BUCKET;
  if (url && serviceKey && bucket) return { url, serviceKey, bucket };
  return null;
}

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: Uint8Array },
) => Promise<{ ok: boolean; status: number }>;

/**
 * Upload bytes to `<bucket>/<storageKey>` in Supabase Storage. Returns `{stored:false}` when
 * storage is unconfigured (hermetic) so callers still record the descriptor. Throws (with the
 * service key redacted) on an HTTP error so a configured deployment never silently loses a file.
 * `config`/`fetchImpl` are injection seams for unit tests.
 */
export async function putObject(
  storageKey: string,
  contentType: string,
  bytes: Uint8Array,
  deps: { config?: StorageConfig | null; fetchImpl?: FetchLike } = {},
): Promise<{ stored: boolean }> {
  const config = deps.config !== undefined ? deps.config : storageConfig();
  if (!config) return { stored: false };

  // Defense-in-depth: storageKey is app-generated + opaque (assets.ts), but putObject is an exported
  // lib — refuse a path-traversal / unexpected shape so a future caller can't escape the bucket prefix.
  if (storageKey.includes("..") || !/^[a-z][a-z0-9-]*\/[A-Za-z0-9._-]+$/.test(storageKey)) {
    throw new Error("Refusing to store an object with an unexpected storageKey shape.");
  }

  const f = deps.fetchImpl ?? (fetch as unknown as FetchLike);
  const endpoint = `${config.url.replace(/\/+$/, "")}/storage/v1/object/${config.bucket}/${storageKey}`;
  const res = await f(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.serviceKey}`,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: bytes,
  });
  if (!res.ok) {
    // Names only the (non-PII) storageKey + status; redact() is a defensive backstop so a
    // crafted key can't echo a secret. The service key is never interpolated into the message.
    throw new Error(redact(`Storage upload failed (HTTP ${res.status}) for ${storageKey}`));
  }
  return { stored: true };
}
