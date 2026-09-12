import { describe, expect, it, vi } from "vitest";
import { decryptSecret, encryptSecret, generateSecretKey } from "../../lib/integrations/secret-vault";
import { exchangeAuthorizationCode } from "../../lib/integrations/microsoft-oauth";

const KEY = generateSecretKey();

describe("integration secret vault", () => {
  it("generates a 32-byte base64 key", () => {
    expect(Buffer.from(generateSecretKey(), "base64")).toHaveLength(32);
  });

  it("round-trips a refresh token", () => {
    const token = "0.AXoA-refresh-token_value-1234567890";
    const payload = encryptSecret(token, KEY);
    expect(payload).not.toContain(token);
    expect(decryptSecret(payload, KEY)).toBe(token);
  });

  it("produces a different ciphertext each time for the same input", () => {
    expect(encryptSecret("same", KEY)).not.toBe(encryptSecret("same", KEY));
  });

  it("rejects a tampered payload", () => {
    const payload = encryptSecret("sensitive", KEY);
    const parts = payload.split(".");
    const flipped = Buffer.from(parts[3], "base64url");
    flipped[0] ^= 0xff;
    parts[3] = flipped.toString("base64url");
    expect(() => decryptSecret(parts.join("."), KEY)).toThrow();
  });

  it("rejects the wrong key and malformed payloads", () => {
    const payload = encryptSecret("sensitive", KEY);
    expect(() => decryptSecret(payload, generateSecretKey())).toThrow();
    expect(() => decryptSecret("not-a-payload", KEY)).toThrow();
    expect(() => decryptSecret("", KEY)).toThrow();
  });
});

describe("Entra authorization-code exchange", () => {
  const base = {
    code: "auth-code-123",
    clientId: "client-id",
    tenantId: "tenant-id",
    redirectUri: "https://app.flowstate.partners/api/clients/c1/integrations/sharepoint/callback",
    clientSecret: "client-secret",
  };

  it("posts the code to the tenant token endpoint and never puts the secret in the URL", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      access_token: "access-1", refresh_token: "refresh-1", expires_in: 3600, scope: "Sites.Read.All",
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const result = await exchangeAuthorizationCode({ ...base, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://login.microsoftonline.com/tenant-id/oauth2/v2.0/token");
    expect(url).not.toContain("client-secret");
    const body = String(init.body);
    expect(body).toContain("grant_type=authorization_code");
    expect(body).toContain("code=auth-code-123");
    expect(body).toContain("client_secret=client-secret");
    expect(result.accessToken).toBe("access-1");
    expect(result.refreshToken).toBe("refresh-1");
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("throws instead of reporting success when Entra rejects the code", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      error: "invalid_grant", error_description: "The provided value for the code parameter is not valid.",
    }), { status: 400, headers: { "content-type": "application/json" } }));

    await expect(exchangeAuthorizationCode({ ...base, fetchImpl })).rejects.toThrow(/invalid_grant/);
  });

  it("throws when the response is 200 but has no access token", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ token_type: "Bearer" }), {
      status: 200, headers: { "content-type": "application/json" },
    }));
    await expect(exchangeAuthorizationCode({ ...base, fetchImpl })).rejects.toThrow(/access token/i);
  });
});
