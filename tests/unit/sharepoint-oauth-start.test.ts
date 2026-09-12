import { describe, expect, it } from "vitest";
import {
  MICROSOFT_GRAPH_SCOPES,
  buildMicrosoftAuthorizeUrl,
  createOAuthState,
  isOAuthStateValid,
} from "../../lib/integrations/microsoft-oauth";

const base = {
  clientId: "test-client-id",
  tenantId: "test-tenant-id",
  redirectUri: "https://app.flowstate.partners/api/clients/c1/integrations/sharepoint/callback",
};

describe("Microsoft Entra authorization-code start", () => {
  it("targets the tenant-specific v2 authorize endpoint", () => {
    const url = buildMicrosoftAuthorizeUrl({ ...base, state: "state-123" });
    expect(url.startsWith(`https://login.microsoftonline.com/${base.tenantId}/oauth2/v2.0/authorize?`)).toBe(true);
  });

  it("requests the authorization code flow with a state value", () => {
    const url = new URL(buildMicrosoftAuthorizeUrl({ ...base, state: "state-123" }));
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe(base.clientId);
    expect(url.searchParams.get("redirect_uri")).toBe(base.redirectUri);
    expect(url.searchParams.get("state")).toBe("state-123");
  });

  it("requests least-privilege delegated scopes and never a client secret", () => {
    const url = new URL(buildMicrosoftAuthorizeUrl({ ...base, state: "state-123" }));
    const scopes = (url.searchParams.get("scope") ?? "").split(" ");
    expect(scopes).toEqual([...MICROSOFT_GRAPH_SCOPES]);
    expect(scopes).toContain("offline_access");
    expect(scopes).not.toContain("Sites.ReadWrite.All");
    expect(scopes).not.toContain("Files.ReadWrite.All");
    expect(url.searchParams.has("client_secret")).toBe(false);
    expect(url.searchParams.has("clientSecret")).toBe(false);
  });

  it("generates unpredictable single-use state values", () => {
    const a = createOAuthState();
    const b = createOAuthState();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });

  it("accepts only the exact expected state and rejects missing or mismatched values", () => {
    const state = createOAuthState();
    expect(isOAuthStateValid(state, state)).toBe(true);
    expect(isOAuthStateValid("attacker", state)).toBe(false);
    expect(isOAuthStateValid(null, state)).toBe(false);
    expect(isOAuthStateValid("", state)).toBe(false);
    expect(isOAuthStateValid(state, null)).toBe(false);
    expect(isOAuthStateValid(state + "x", state)).toBe(false);
  });
});
