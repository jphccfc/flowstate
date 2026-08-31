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

  it("makes the disconnected journey explicit and keeps sync disabled", () => {
    expect(page).toContain("Not connected");
    expect(page).toContain("Connect Microsoft 365");
    expect(page).toContain("Site");
    expect(page).toContain("Library");
    expect(page).toContain("Folder");
    expect(page).toContain("Sync now");
    expect(page).toContain("disabled={true}");
    expect(page).toContain("No Microsoft Graph or SharePoint connection is configured");
  });

  it("shows an accessible connection prerequisite status immediately in the connection section", () => {
    const connectionSection = page.match(/<section[^>]*aria-labelledby=\"connection-status\"[\s\S]*?<\/section>/)?.[0] ?? "";

    expect(connectionSection).toContain('role="status"');
    expect(connectionSection).toContain("Microsoft 365 connection setup is not available in this foundation.");
    expect(connectionSection).toContain("No Microsoft Graph or SharePoint connection is configured.");
    expect(connectionSection).not.toContain("Connected");
  });

  it("uses a provider-neutral import preview contract without storing OAuth tokens", () => {
    expect(adapter).toContain("SharePointSourceSelection");
    expect(adapter).toContain("ImportPreview");
    expect(adapter).toContain("NotConnected");
    expect(adapter).toContain("encryptedSecretRef");
    expect(adapter).not.toContain("accessToken");
    expect(route).toContain("preview");
    expect(route).toContain("sourceSelection");
  });
});
