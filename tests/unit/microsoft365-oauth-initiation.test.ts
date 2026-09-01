import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildMicrosoft365AuthorizationUrl, createMicrosoft365OAuthState } from "@/lib/integrations/sharepoint";

const root = process.cwd();
const route = readFileSync(resolve(root, "app/api/clients/[id]/integrations/sharepoint/connect/route.ts"), "utf8");
const page = readFileSync(resolve(root, "app/clients/[id]/integrations/sharepoint/page.tsx"), "utf8");
const adapter = readFileSync(resolve(root, "lib/integrations/sharepoint.ts"), "utf8");

describe("Microsoft 365 OAuth initiation", () => {
  it("builds a tenant-scoped authorize URL with configured least-privilege scopes", () => {
    const url = buildMicrosoft365AuthorizationUrl({ tenantId: "tenant.example", clientId: "client-id", redirectUri: "https://app.example.test/api/oauth/microsoft/callback", scopes: ["openid", "profile", "User.Read"], state: "state-value" });
    const parsed = new URL(url);
    expect(parsed.origin).toBe("https://login.microsoftonline.com");
    expect(parsed.pathname).toBe("/tenant.example/oauth2/v2.0/authorize");
    expect(parsed.searchParams.get("client_id")).toBe("client-id");
    expect(parsed.searchParams.get("redirect_uri")).toBe("https://app.example.test/api/oauth/microsoft/callback");
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("response_mode")).toBe("query");
    expect(parsed.searchParams.get("scope")).toBe("openid profile User.Read");
    expect(parsed.searchParams.get("state")).toBe("state-value");
  });

  it("uses configured scopes and never exposes secret or token material", () => {
    expect(adapter).toContain("MICROSOFT_ENTRA_SCOPES");
    expect(route).toContain("authorizationUrl");
    expect(adapter).toContain("httpOnly: true");
    expect(adapter).toContain("secure: true");
    expect(adapter).toContain("maxAge: 600");
    expect(route).not.toMatch(/client[_-]?secret|access[_-]?token|refresh[_-]?token/i);
  });

  it("redirects the browser only for a ready response and keeps sync disabled", () => {
    expect(page).toContain('data.connectionState === "Ready"');
    expect(page).toContain("window.location.assign(data.authorizationUrl)");
    expect(page).toContain("syncEnabled");
    expect(page).toContain("disabled={true}");
  });

  it("creates an unpredictable state and secure expiring HttpOnly SameSite cookie options", () => {
    const first = createMicrosoft365OAuthState();
    const second = createMicrosoft365OAuthState();
    expect(first.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.value).not.toBe(second.value);
    expect(first.cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
  });
});
