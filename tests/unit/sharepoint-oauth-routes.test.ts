import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const authorizePath = resolve(root, "app/api/clients/[id]/integrations/sharepoint/authorize/route.ts");
const callbackPath = resolve(root, "app/api/clients/[id]/integrations/sharepoint/callback/route.ts");
const authorize = readFileSync(authorizePath, "utf8");
const callback = readFileSync(callbackPath, "utf8");

describe("SharePoint OAuth start route", () => {
  it("exists as an organisation-scoped route", () => {
    expect(existsSync(authorizePath)).toBe(true);
    expect(authorize).toContain("params: Promise<{ id: string }>");
  });

  it("requires authentication and the client.configure permission", () => {
    expect(authorize).toContain("auth.getUser()");
    expect(authorize).toContain('if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })');
    expect(authorize).toContain('hasOrganizationPermission(user.email, id, "client.configure")');
    expect(authorize).toContain("{ status: 403 }");
  });

  it("refuses to start the flow when Microsoft 365 is not configured", () => {
    expect(authorize).toContain("getMicrosoft365ConnectionReadiness()");
    expect(authorize).toContain("{ status: 409 }");
    expect(authorize).toContain("missingConfiguration");
  });

  it("carries the CSRF state in a signed httpOnly cookie, not the client", () => {
    expect(authorize).toContain("signOAuthState(");
    expect(authorize).toContain("OAUTH_STATE_COOKIE");
    expect(authorize).toContain("httpOnly: true");
    expect(authorize).toContain('sameSite: "lax"');
    expect(authorize).toContain("organizationId: id");
  });

  it("persists nothing and returns no tokens while starting the flow", () => {
    expect(authorize).not.toContain("saveConnection");
    expect(authorize).not.toContain("accessToken");
    expect(authorize).not.toMatch(/access_token|refresh_token/);
  });
});

describe("SharePoint OAuth callback route", () => {
  it("verifies the signed state before doing anything else with the code", () => {
    const verifyAt = callback.indexOf("verifyOAuthState(");
    const exchangeAt = callback.indexOf("exchangeAuthorizationCode(");
    expect(verifyAt).toBeGreaterThan(-1);
    expect(exchangeAt).toBeGreaterThan(verifyAt);
  });

  it("binds the callback to the organisation and the issued state", () => {
    expect(callback).toContain("payload.organizationId !== id");
    expect(callback).toContain("isOAuthStateValid(returnedState, payload.state)");
  });

  it("fails closed on every error path instead of claiming a connection", () => {
    for (const code of ["state_invalid", "organization_mismatch", "state_mismatch", "consent_denied", "code_missing", "not_configured", "exchange_failed", "persist_failed"]) {
      expect(callback).toContain(`fail("${code}")`);
    }
  });

  it("stores tokens through the encrypting store and never returns them", () => {
    expect(callback).toContain("saveConnection(prisma");
    expect(callback).toContain("organizationId: id");
    expect(callback).not.toContain("accessToken");
    expect(callback).not.toMatch(/NextResponse\.json\([^)]*access_token/);
    expect(callback).toContain("response.cookies.delete(OAUTH_STATE_COOKIE)");
  });

  it("only reports success after a successful exchange and persistence", () => {
    const connectedAt = callback.indexOf('"connected"');
    const exchangeAt = callback.indexOf("await exchangeAuthorizationCode(");
    const persistAt = callback.indexOf("await saveConnection(");
    expect(connectedAt).toBeGreaterThan(exchangeAt);
    expect(connectedAt).toBeGreaterThan(persistAt);
  });
});
