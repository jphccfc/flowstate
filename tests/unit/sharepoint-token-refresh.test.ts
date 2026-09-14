import { describe, expect, it, vi } from "vitest";
import { refreshAccessToken } from "../../lib/integrations/microsoft-oauth";

describe("Entra refresh-token exchange", () => {
  const base = {
    refreshToken: "refresh-old",
    clientId: "client-id",
    tenantId: "tenant-id",
    clientSecret: "client-secret",
  };

  it("refreshes an expired access token server-side", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      access_token: "access-new", refresh_token: "refresh-new", expires_in: 3600, scope: "Files.Read.All",
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const result = await refreshAccessToken({ ...base, fetchImpl });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://login.microsoftonline.com/tenant-id/oauth2/v2.0/token");
    expect(String(init.body)).toContain("grant_type=refresh_token");
    expect(String(init.body)).toContain("refresh_token=refresh-old");
    expect(url).not.toContain("client-secret");
    expect(result.accessToken).toBe("access-new");
    expect(result.refreshToken).toBe("refresh-new");
  });

  it("preserves the old refresh token when Microsoft does not rotate it", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ access_token: "access-new", expires_in: 1200 }), { status: 200 }));
    const result = await refreshAccessToken({ ...base, fetchImpl });
    expect(result.refreshToken).toBe("refresh-old");
  });

  it("fails closed when the refresh token is rejected", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }));
    await expect(refreshAccessToken({ ...base, fetchImpl })).rejects.toThrow(/invalid_grant/);
  });
});
