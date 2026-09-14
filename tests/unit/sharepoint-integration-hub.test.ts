import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const nav = readFileSync(resolve(root, "components/layout/WorkspaceNav.tsx"), "utf8");
const page = readFileSync(resolve(root, "app/clients/[id]/integrations/sharepoint/page.tsx"), "utf8");
const route = readFileSync(resolve(root, "app/api/clients/[id]/integrations/sharepoint/route.ts"), "utf8");
const adapter = readFileSync(resolve(root, "lib/integrations/sharepoint.ts"), "utf8");

describe("SharePoint integration hub foundation", () => {
  it("exposes an organisation-scoped SharePoint integration route from workspace navigation", () => {
    expect(nav).toContain('label: "Integrations"');
    expect(nav).toContain("/integrations/sharepoint");
    expect(page).toContain("/api/clients/${organizationId}/integrations/sharepoint");
    expect(route).toContain('hasOrganizationPermission(user.email, id, permission)');
    expect(route).toContain("organizationId: id");
  });
  it("makes the disconnected journey explicit and keeps import disabled", () => {
    expect(page).toContain("Connect Microsoft 365");
    expect(page).toContain("Site"); expect(page).toContain("Library"); expect(page).toContain("Folder");
    // Import stays unusable until a real connection exists and a library is chosen.
    expect(page).toContain("Import folder");
    expect(page).toContain("disabled={!isConnected || !selectedLibrary || importing}");
    expect(page).toContain("No Microsoft Graph or SharePoint connection is configured");
  });
  it("shows an accessible connection prerequisite status immediately in the connection section", () => {
    const connectionSection = page.match(/<section[^>]*aria-labelledby="connection-status"[\s\S]*?<\/section>/)?.[0] ?? "";
    expect(connectionSection).toContain('role="status"');
    // The prerequisite copy is composed in statusMessage and rendered by the
    // section; assert both the wiring and the text.
    expect(connectionSection).toContain("{statusMessage}");
    expect(page).toContain("Microsoft 365 connection setup is not available.");
    expect(page).toContain("No Microsoft Graph or SharePoint connection is configured.");
    // The section may only branch on isConnected, which the page derives from
    // the stored connection record rather than asserting unconditionally.
    expect(connectionSection).toContain("isConnected");
    expect(page).toContain('const isConnected = connection?.connectionState === "Connected"');
  });
  it("uses a provider-neutral import preview contract without storing OAuth tokens", () => {
    expect(adapter).toContain("SharePointSourceSelection"); expect(adapter).toContain("ImportPreview");
    expect(adapter).toContain("NotConnected"); expect(adapter).toContain("encryptedSecretRef");
    expect(adapter).not.toContain("accessToken"); expect(route).toContain("preview"); expect(route).toContain("sourceSelection");
  });
  it("exposes a configuration-only connect readiness boundary", () => {
    const connectRoute = readFileSync(resolve(root, "app/api/clients/[id]/integrations/sharepoint/connect/route.ts"), "utf8");
    expect(connectRoute).toContain("getMicrosoft365ConnectionReadiness");
    expect(connectRoute).toContain('hasOrganizationPermission(user.email, id, "client.configure")');
    expect(connectRoute).toContain('connectionState: "NotConfigured"'); expect(connectRoute).toContain("missingConfiguration");
    expect(connectRoute).not.toContain("access_token"); expect(connectRoute).not.toContain("client_secret");
  });
  it("renders readiness and failure states without claiming a verified connection", () => {
    expect(page).toContain("Ready to connect"); expect(page).toContain("Microsoft 365 settings are not configured");
    expect(page).toContain("Connection setup failed"); expect(page).toContain("connectionState"); expect(page).toContain("syncEnabled");
    // A verified connection may only ever be derived from the stored record.
    expect(page).toContain('const isConnected = connection?.connectionState === "Connected"');
  });
});
