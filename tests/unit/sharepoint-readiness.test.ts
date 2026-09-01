import { afterEach, describe, expect, it } from "vitest";
import { getMicrosoft365ConnectionReadiness } from "@/lib/integrations/sharepoint";

const names = ["MICROSOFT_ENTRA_CLIENT_ID", "MICROSOFT_ENTRA_TENANT_ID", "MICROSOFT_ENTRA_REDIRECT_URI"] as const;
const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));
afterEach(() => names.forEach((name) => { if (original[name] === undefined) delete process.env[name]; else process.env[name] = original[name]; }));

describe("Microsoft 365 connection readiness", () => {
  it("reports missing non-secret Entra configuration without exposing values", () => {
    names.forEach((name) => delete process.env[name]);
    const result = getMicrosoft365ConnectionReadiness();
    expect(result).toMatchObject({ provider: "microsoft-365", connectionState: "NotConfigured", configured: false, syncEnabled: false });
    expect(result.missingConfiguration).toEqual([...names]);
    expect(JSON.stringify(result)).not.toMatch(/secret|token|password/i);
  });

  it("reports readiness only when all required non-secret settings exist", () => {
    process.env.MICROSOFT_ENTRA_CLIENT_ID = "client-id";
    process.env.MICROSOFT_ENTRA_TENANT_ID = "tenant-id";
    process.env.MICROSOFT_ENTRA_REDIRECT_URI = "https://example.test/callback";
    expect(getMicrosoft365ConnectionReadiness()).toEqual({ provider: "microsoft-365", connectionState: "Ready", configured: true, missingConfiguration: [], syncEnabled: false });
  });
});
