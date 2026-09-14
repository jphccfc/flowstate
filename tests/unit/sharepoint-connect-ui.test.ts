import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const page = read("app/clients/[id]/integrations/sharepoint/page.tsx");
const route = read("app/api/clients/[id]/integrations/sharepoint/route.ts");

describe("SharePoint connect action", () => {
  it("navigates to the authorize route so the browser reaches Microsoft's consent screen", () => {
    expect(page).toContain("window.location.assign(`${api}/authorize`)");
    expect(page).toContain("const api = `/api/clients/${organizationId}/integrations/sharepoint`");
  });

  it("no longer reports readiness instead of starting the flow", () => {
    // The previous implementation POSTed to /connect, which only echoed
    // readiness — the button appeared to do nothing.
    expect(page).not.toMatch(/connect\/`,\s*\{\s*method:\s*"POST"/);
    expect(page).not.toContain("/integrations/sharepoint/connect");
  });

  it("refreshes connection state on mount so a returning callback is reflected", () => {
    expect(page).toContain("setConnection(data.connection ?? null)");
  });

  it("surfaces the callback result and then clears it from the URL", () => {
    expect(page).toContain('get("sharepoint")');
    expect(page).toContain("window.history.replaceState");
  });

  it("maps every callback failure code to a client-readable message", () => {
    for (const code of [
      "consent_denied",
      "state_invalid",
      "state_mismatch",
      "organization_mismatch",
      "code_missing",
      "exchange_failed",
      "persist_failed",
      "not_configured",
    ]) {
      expect(page).toContain(code);
    }
  });

  it("never puts token material in the page", () => {
    for (const forbidden of ["encryptedTokens", "accessToken", "refreshToken"]) {
      expect(page).not.toContain(forbidden);
    }
  });
});

describe("SharePoint connection status route", () => {
  it("reports the real connection alongside readiness", () => {
    expect(route).toContain("getConnectionStatus(prisma, id, SHAREPOINT_PROVIDER)");
    expect(route).toContain("connection,");
  });

  it("returns null rather than failing the page when status cannot be read", () => {
    expect(route).toMatch(/catch\s*\{\s*connection = null;\s*\}/);
  });

  it("exposes a disconnect that requires configure permission", () => {
    expect(route).toContain('authorize(id, "client.configure")');
    expect(route).toContain("disconnect(prisma, id, SHAREPOINT_PROVIDER)");
  });

  it("never returns token material from the status route", () => {
    for (const forbidden of ["encryptedTokens", "accessToken", "refreshToken"]) {
      expect(route).not.toContain(forbidden);
    }
  });
});
