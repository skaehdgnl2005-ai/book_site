import { describe, it, expect } from "vitest";
import { storageConfig, putObject } from "../../src/lib/storage";

describe("storageConfig", () => {
  const full = {
    SUPABASE_URL: "https://x.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "secret",
    SUPABASE_STORAGE_BUCKET: "assets",
  };

  it("returns null unless ALL three vars are present (descriptor-only / hermetic)", () => {
    expect(storageConfig({})).toBeNull();
    expect(storageConfig({ ...full, SUPABASE_URL: undefined })).toBeNull();
    expect(storageConfig({ ...full, SUPABASE_SERVICE_ROLE_KEY: undefined })).toBeNull();
    expect(storageConfig({ ...full, SUPABASE_STORAGE_BUCKET: undefined })).toBeNull();
  });

  it("returns the parsed config when all three are present", () => {
    expect(storageConfig(full)).toEqual({ url: "https://x.supabase.co", serviceKey: "secret", bucket: "assets" });
  });
});

describe("putObject", () => {
  const config = { url: "https://x.supabase.co", serviceKey: "secret-key", bucket: "assets" };

  it("is a no-op (stored:false) when storage is unconfigured — bytes skipped, descriptor still usable", async () => {
    const res = await putObject("child-photo/a.jpg", "image/jpeg", new Uint8Array([1]), { config: null });
    expect(res).toEqual({ stored: false });
  });

  it("PUTs bytes to the Supabase Storage object endpoint with bearer auth + upsert", async () => {
    const calls: Array<{ url: string; init: { method: string; headers: Record<string, string>; body: Uint8Array } }> = [];
    const fetchImpl = async (url: string, init: { method: string; headers: Record<string, string>; body: Uint8Array }) => {
      calls.push({ url, init });
      return { ok: true, status: 200 };
    };
    const bytes = new Uint8Array([1, 2, 3]);
    const res = await putObject("child-photo/abc.jpg", "image/jpeg", bytes, { config, fetchImpl });

    expect(res).toEqual({ stored: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://x.supabase.co/storage/v1/object/assets/child-photo/abc.jpg");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.headers.Authorization).toBe("Bearer secret-key");
    expect(calls[0].init.headers["Content-Type"]).toBe("image/jpeg");
    expect(calls[0].init.headers["x-upsert"]).toBe("true");
    expect(calls[0].init.body).toBe(bytes);
  });

  it("throws on a non-ok response WITHOUT leaking the service key", async () => {
    const fetchImpl = async () => ({ ok: false, status: 403 });
    let msg = "";
    try {
      await putObject("child-photo/a.jpg", "image/jpeg", new Uint8Array([1]), { config, fetchImpl });
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toContain("403");
    expect(msg).not.toContain("secret-key");
  });
});
