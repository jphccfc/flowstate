import { describe, expect, it } from "vitest";
import { describeMicrosoftConfigProblem } from "../../lib/integrations/microsoft-config";

const GOOD = {
  clientId: "11111111-2222-3333-4444-555555555555",
  tenantId: "66666666-7777-8888-9999-000000000000",
  redirectUri: "https://app.flowstate.partners/api/integrations/sharepoint/callback",
};

describe("Microsoft 365 configuration shape", () => {
  it("accepts well-formed settings", () => {
    expect(describeMicrosoftConfigProblem(GOOD)).toBeNull();
  });

  it("accepts a tenant domain as well as a GUID", () => {
    expect(describeMicrosoftConfigProblem({ ...GOOD, tenantId: "contoso.onmicrosoft.com" })).toBeNull();
  });

  // The two failure modes observed in production, reproduced exactly.
  it("catches a web address pasted into the client id", () => {
    const problem = describeMicrosoftConfigProblem({
      ...GOOD,
      clientId: "https://vercel.com/jphccfcs-projects/flowstate/settings/environment-variables",
    });
    expect(problem?.code).toBe("malformed");
    expect(problem?.envVar).toBe("MICROSOFT_ENTRA_CLIENT_ID");
    expect(problem?.message).toMatch(/web address/);
  });

  it("catches a client secret pasted into the tenant id", () => {
    const problem = describeMicrosoftConfigProblem({
      ...GOOD,
      tenantId: "abc12Q~NotARealSecretValueForTestingPurposes1234567890",
    });
    expect(problem?.code).toBe("malformed");
    expect(problem?.envVar).toBe("MICROSOFT_ENTRA_TENANT_ID");
    expect(problem?.message).toMatch(/client secret/);
  });

  it("never echoes the offending value back", () => {
    const secret = "abc12Q~NotARealSecretValueForTestingPurposes1234567890";
    const problem = describeMicrosoftConfigProblem({ ...GOOD, tenantId: secret });
    expect(problem?.message).not.toContain(secret);
    expect(problem?.message).not.toContain("abc12Q");
  });

  it("flags a trailing slash on the redirect URI, which Microsoft rejects", () => {
    const problem = describeMicrosoftConfigProblem({
      ...GOOD,
      redirectUri: `${GOOD.redirectUri}/`,
    });
    expect(problem?.envVar).toBe("MICROSOFT_ENTRA_REDIRECT_URI");
    expect(problem?.message).toMatch(/trailing slash/);
  });

  it("flags a non-https redirect URI", () => {
    const problem = describeMicrosoftConfigProblem({
      ...GOOD,
      redirectUri: "http://app.flowstate.partners/api/integrations/sharepoint/callback",
    });
    expect(problem?.envVar).toBe("MICROSOFT_ENTRA_REDIRECT_URI");
  });

  it("reports a missing variable by name", () => {
    const problem = describeMicrosoftConfigProblem({ ...GOOD, clientId: "" });
    expect(problem?.code).toBe("missing");
    expect(problem?.envVar).toBe("MICROSOFT_ENTRA_CLIENT_ID");
  });

  it("reports problems in a stable order so the first fix is always the shown one", () => {
    const problem = describeMicrosoftConfigProblem({ clientId: null, tenantId: "nonsense", redirectUri: null });
    expect(problem?.envVar).toBe("MICROSOFT_ENTRA_CLIENT_ID");
  });
});

describe("guard must not block valid configurations", () => {
  it.each(["common", "organizations", "consumers"])("accepts the tenant alias %s", (alias) => {
    expect(describeMicrosoftConfigProblem({ ...GOOD, tenantId: alias })).toBeNull();
  });

  it("accepts an uppercase tenant domain", () => {
    expect(describeMicrosoftConfigProblem({ ...GOOD, tenantId: "Contoso.OnMicrosoft.com" })).toBeNull();
  });
});
